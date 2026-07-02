[CmdletBinding()]
param(
    [switch]$SkipLaunch,
    [switch]$SkipShortcut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectRoot = $PSScriptRoot
$virtualEnvironment = Join-Path $projectRoot '.venv'
$virtualPython = Join-Path $virtualEnvironment 'Scripts\python.exe'
$requirementsFile = Join-Path $projectRoot 'requirements.txt'
$databaseVerificationScript = Join-Path $projectRoot 'scripts\verify_fresh_install.py'
$releaseVerificationScript = Join-Path $projectRoot 'scripts\verify_release.py'
$shortcutInstaller = Join-Path $projectRoot 'launcher\Install-DesktopShortcut.ps1'
$dashboardLauncher = Join-Path $projectRoot 'launcher\Open Personal Dashboard.vbs'

function Write-SetupStep {
    param([string]$Message)

    Write-Host ""
    Write-Host "  $Message" -ForegroundColor Cyan
}

function Test-PythonCandidate {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [string[]]$PrefixArguments = @()
    )

    try {
        $arguments = @($PrefixArguments) + @(
            '-c',
            'import sys; print(*sys.version_info[:3]); raise SystemExit(sys.version_info < (3, 10))'
        )
        $versionOutput = & $Executable @arguments 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $versionOutput) {
            return $null
        }

        $versionParts = (($versionOutput | Select-Object -Last 1).Trim() -split '\s+')
        if ($versionParts.Count -lt 3) {
            return $null
        }

        return [pscustomobject]@{
            Executable = $Executable
            Arguments = [string[]]@($PrefixArguments)
            Version = ($versionParts[0..2] -join '.')
        }
    }
    catch {
        return $null
    }
}

function Get-CompatiblePython {
    if (Test-Path -LiteralPath $virtualPython) {
        $virtualCandidate = Test-PythonCandidate -Executable $virtualPython
        if ($null -ne $virtualCandidate) {
            return $virtualCandidate
        }
    }

    $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($null -ne $pyLauncher) {
        $candidate = Test-PythonCandidate `
            -Executable $pyLauncher.Source `
            -PrefixArguments @('-3')
        if ($null -ne $candidate) {
            return $candidate
        }
    }

    foreach ($commandName in @('python.exe', 'python3.exe')) {
        $pythonCommand = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($null -eq $pythonCommand) {
            continue
        }

        $candidate = Test-PythonCandidate -Executable $pythonCommand.Source
        if ($null -ne $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-PythonManager {
    $managerCommand = Get-Command 'pymanager.exe' -ErrorAction SilentlyContinue
    if ($null -ne $managerCommand) {
        return $managerCommand.Source
    }

    $windowsApps = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    $managerPaths = @(
        (Join-Path $windowsApps 'PythonSoftwareFoundation.PythonManager_3847v3x7pw1km\pymanager.exe'),
        (Join-Path $windowsApps 'PythonSoftwareFoundation.PythonManager_qbz5n2kfra8p0\pymanager.exe')
    )

    return $managerPaths |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}

function Install-Python {
    Write-SetupStep 'Python 3.10+ was not found. Installing the official Python Install Manager...'

    $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
    if ($null -eq $winget -and (Get-Command 'Add-AppxPackage' -ErrorAction SilentlyContinue)) {
        try {
            Add-AppxPackage `
                -RegisterByFamilyName `
                -MainPackage 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' `
                -ErrorAction Stop
            $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
        }
        catch {
            # The actionable error below is clearer than the registration error.
        }
    }

    if ($null -eq $winget) {
        throw @'
Windows Package Manager is unavailable.

Install "App Installer" from Microsoft, then run Setup-Lumen.cmd again:
https://aka.ms/getwinget
'@
    }

    & $winget.Source install 9NQ7512CXL7T `
        --exact `
        --accept-package-agreements `
        --accept-source-agreements `
        --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
        throw "The official Python Install Manager could not be installed (exit code $LASTEXITCODE)."
    }

    $pythonManager = Get-PythonManager
    if (-not $pythonManager) {
        throw 'Python Install Manager was installed, but Windows has not exposed its command yet. Sign out and back in, then rerun Setup-Lumen.cmd.'
    }

    Write-SetupStep 'Installing the current stable Python runtime...'
    & $pythonManager install default
    if ($LASTEXITCODE -ne 0) {
        throw "Python could not be installed (exit code $LASTEXITCODE)."
    }

    $runtimePath = & $pythonManager list --one --format=exe default
    if ($LASTEXITCODE -eq 0 -and $runtimePath) {
        $runtimeCandidate = Test-PythonCandidate `
            -Executable (($runtimePath | Select-Object -Last 1).Trim())
        if ($null -ne $runtimeCandidate) {
            return $runtimeCandidate
        }
    }

    $candidate = Get-CompatiblePython
    if ($null -eq $candidate) {
        throw 'Python installation completed, but its runtime could not be located. Rerun Setup-Lumen.cmd once.'
    }
    return $candidate
}

try {
    Write-Host ""
    Write-Host "  Lumen setup" -ForegroundColor Magenta
    Write-Host "  A private, local workspace for your day." -ForegroundColor DarkGray

    foreach ($requiredPath in @(
        $requirementsFile,
        $databaseVerificationScript,
        $releaseVerificationScript,
        $shortcutInstaller
    )) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "The setup package is incomplete. Missing file: $requiredPath"
        }
    }

    $python = Get-CompatiblePython
    if ($null -eq $python) {
        $python = Install-Python
    }

    Write-SetupStep "Using Python $($python.Version)"

    $virtualCandidate = $null
    if (Test-Path -LiteralPath $virtualPython) {
        $virtualCandidate = Test-PythonCandidate -Executable $virtualPython
    }

    if ($null -eq $virtualCandidate) {
        if (Test-Path -LiteralPath $virtualEnvironment) {
            Write-SetupStep 'Repairing the isolated Lumen environment...'
            $venvOptions = @('--clear')
        }
        else {
            Write-SetupStep 'Creating an isolated environment for Lumen...'
            $venvOptions = @()
        }

        $pythonArguments = @($python.Arguments)
        & $python.Executable @pythonArguments -m venv @venvOptions $virtualEnvironment
        if ($LASTEXITCODE -ne 0) {
            throw "The Lumen environment could not be created (exit code $LASTEXITCODE)."
        }
    }

    Write-SetupStep 'Installing Lumen dependencies...'
    $env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
    $env:PIP_DEFAULT_TIMEOUT = '60'
    & $virtualPython -m pip install `
        --retries 3 `
        --requirement $requirementsFile
    if ($LASTEXITCODE -ne 0) {
        throw "Lumen dependencies could not be installed (exit code $LASTEXITCODE)."
    }

    Write-SetupStep 'Checking the application and a fresh private database...'
    & $virtualPython $databaseVerificationScript
    if ($LASTEXITCODE -ne 0) {
        throw 'The fresh-database validation failed.'
    }
    & $virtualPython $releaseVerificationScript
    if ($LASTEXITCODE -ne 0) {
        throw 'The application release validation failed.'
    }

    if (-not $SkipShortcut) {
        Write-SetupStep 'Installing the Lumen desktop shortcut...'
        & $shortcutInstaller
    }

    Write-Host ""
    Write-Host "  Lumen is ready." -ForegroundColor Green
    Write-Host "  Your data stays in database.db on this computer." -ForegroundColor DarkGray

    if (-not $SkipLaunch) {
        if (-not (Test-Path -LiteralPath $dashboardLauncher)) {
            throw "The dashboard launcher was not found: $dashboardLauncher"
        }
        Start-Process `
            -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') `
            -ArgumentList "`"$dashboardLauncher`""
    }
}
catch {
    Write-Host ""
    Write-Host "  Setup stopped: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}
