@echo off
setlocal
title Lumen Setup

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Lumen.ps1" %*
set "LUMEN_SETUP_EXIT=%ERRORLEVEL%"

if not "%LUMEN_SETUP_EXIT%"=="0" (
    echo.
    echo Lumen setup did not finish. Read the message above, then try again.
    pause
)

exit /b %LUMEN_SETUP_EXIT%
