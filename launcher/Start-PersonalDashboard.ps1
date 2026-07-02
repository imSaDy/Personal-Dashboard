[CmdletBinding()]
param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $PSScriptRoot 'dashboard_server.py'
$dashboardUrl = 'http://127.0.0.1:5000/'
$healthUrl = 'http://127.0.0.1:5000/api/health'
$legacyHealthUrl = 'http://127.0.0.1:5000/api/metrics?timeframe=weekly'
$standardOutputLog = Join-Path $PSScriptRoot 'server.stdout.log'
$standardErrorLog = Join-Path $PSScriptRoot 'server.stderr.log'

function Show-LauncherError {
    param([string]$Message)

    $popup = New-Object -ComObject WScript.Shell
    [void]$popup.Popup($Message, 0, 'Personal Dashboard', 16)
}

function Get-DashboardHealth {
    try {
        return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    }
    catch {
        return $null
    }
}

function Test-LegacyDashboard {
    try {
        $metrics = Invoke-RestMethod -Uri $legacyHealthUrl -TimeoutSec 2
        return $null -ne $metrics.total_hours -and $null -ne $metrics.active_tasks
    }
    catch {
        return $false
    }
}

function Get-DashboardListenerProcessIds {
    $processIds = @()
    $listeners = netstat -ano | Select-String -Pattern '127\.0\.0\.1:5000\s+.*LISTENING'

    foreach ($listener in $listeners) {
        if ($listener.Line -match 'LISTENING\s+(\d+)\s*$') {
            $processIds += [int]$Matches[1]
        }
    }

    return @($processIds | Sort-Object -Unique)
}

function Get-DashboardSourceFiles {
    $sourceFiles = @(
        (Get-Item -LiteralPath (Join-Path $projectRoot 'app.py')),
        (Get-Item -LiteralPath (Join-Path $projectRoot 'database.py')),
        (Get-Item -LiteralPath (Join-Path $projectRoot 'schema.sql')),
        (Get-Item -LiteralPath $serverScript),
        (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'desktop_floating_timer.py'))
    )

    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'templates') -File -Recurse
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'static') -File -Recurse |
        Where-Object { $_.Extension -in @('.js', '.css') }

    return @($sourceFiles | Sort-Object FullName)
}

function Get-CurrentSourceRevision {
    $fingerprints = foreach ($sourceFile in Get-DashboardSourceFiles) {
        $relativePath = $sourceFile.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        $fileHash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
        "$relativePath`:$fileHash"
    }

    $payload = [Text.Encoding]::UTF8.GetBytes(($fingerprints -join "`n"))
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $revisionBytes = $sha256.ComputeHash($payload)
    }
    finally {
        $sha256.Dispose()
    }

    return ([BitConverter]::ToString($revisionBytes)).Replace('-', '')
}

function Stop-StaleDashboard {
    $listenerProcessIds = Get-DashboardListenerProcessIds
    if ($listenerProcessIds.Count -eq 0) {
        return
    }

    $expectedServerPath = [IO.Path]::GetFullPath($serverScript)
    foreach ($processId in $listenerProcessIds) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            continue
        }
        if ($process.ProcessName -notin @('python', 'pythonw', 'py', 'pyw')) {
            throw "Port 5000 is being used by $($process.ProcessName). Close that program and try again."
        }

        $processDetails = Get-CimInstance Win32_Process `
            -Filter "ProcessId = $processId" `
            -ErrorAction SilentlyContinue
        $commandLine = $processDetails.CommandLine
        if (
            -not $commandLine -or
            $commandLine.IndexOf(
                $expectedServerPath,
                [StringComparison]::OrdinalIgnoreCase
            ) -lt 0
        ) {
            throw 'Port 5000 is being used by another Python application. Close it or change LUMEN_PORT before starting Lumen.'
        }

        Stop-Process -Id $processId -Force
    }

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        if ((Get-DashboardListenerProcessIds).Count -eq 0) {
            return
        }
    }

    throw 'The previous dashboard process could not be stopped.'
}

function Test-DashboardReady {
    $health = Get-DashboardHealth
    return $null -ne $health -and $health.app -eq 'lumen-dashboard'
}

function Start-DashboardServer {
    if (-not (Test-Path -LiteralPath $serverScript)) {
        throw "The server launcher was not found:`n$serverScript"
    }

    $virtualPythonw = Join-Path $projectRoot '.venv\Scripts\pythonw.exe'
    if (Test-Path -LiteralPath $virtualPythonw) {
        $pythonExecutable = $virtualPythonw
        $pythonArguments = @(('"{0}"' -f $serverScript))
    }
    else {
        $pythonLauncher = Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue
        if ($null -ne $pythonLauncher) {
            $pythonExecutable = $pythonLauncher.Source
            $pythonArguments = @(('"{0}"' -f $serverScript))
        }
        else {
            $pythonLauncher = Get-Command 'pyw.exe' -ErrorAction SilentlyContinue
            if ($null -eq $pythonLauncher) {
                throw "Lumen is not set up yet.`n`nDouble-click Setup-Lumen.cmd in the project folder, then try again."
            }

            $pythonExecutable = $pythonLauncher.Source
            $pythonArguments = @('-3', ('"{0}"' -f $serverScript))
        }
    }

    Start-Process `
        -FilePath $pythonExecutable `
        -ArgumentList $pythonArguments `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $standardOutputLog `
        -RedirectStandardError $standardErrorLog

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-DashboardReady) {
            return
        }
    }

    throw "The dashboard server did not start.`n`nCheck this log for details:`n$standardErrorLog"
}

try {
    $health = Get-DashboardHealth
    $shouldRestart = $false

    if ($null -ne $health -and $health.app -eq 'lumen-dashboard') {
        $currentRevision = Get-CurrentSourceRevision
        $shouldRestart = -not $health.revision -or $health.revision -ne $currentRevision
    }
    elseif (Test-LegacyDashboard) {
        $shouldRestart = $true
    }
    elseif ((Get-DashboardListenerProcessIds).Count -gt 0) {
        throw 'Port 5000 is already in use by another application.'
    }

    if ($shouldRestart) {
        Stop-StaleDashboard
        Start-DashboardServer
    }
    elseif (-not (Test-DashboardReady)) {
        Start-DashboardServer
    }

    if (-not $SkipBrowser) {
        $chromeCandidates = @(
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
        )
        $chromeExecutable = $chromeCandidates |
            Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
            Select-Object -First 1

        if ($chromeExecutable) {
            Start-Process -FilePath $chromeExecutable -ArgumentList $dashboardUrl
        }
        else {
            Start-Process $dashboardUrl
        }
    }
}
catch {
    Show-LauncherError $_.Exception.Message
    exit 1
}
