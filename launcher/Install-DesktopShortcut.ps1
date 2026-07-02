[CmdletBinding()]
param(
    [string]$ShortcutName = 'Personal Dashboard'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $PSScriptRoot 'Open Personal Dashboard.vbs'
$iconPath = Join-Path $PSScriptRoot 'Lumen.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "$ShortcutName.lnk"

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Dashboard launcher not found: $launcherPath"
}

if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Lumen icon not found: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = "`"$launcherPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Open the Lumen personal dashboard'
$shortcut.Save()

Write-Output "Shortcut installed: $shortcutPath"
