@echo off
REM ===========================================================================
REM Developer Setup Wrapper (CMD)
REM Thin launcher that invokes the PowerShell setup script.
REM ===========================================================================

setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%setup.ps1"

if not exist "%PS_SCRIPT%" (
    echo ERROR: setup.ps1 not found at %PS_SCRIPT%
    exit /b 1
)

REM Forward all arguments to PowerShell script
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
exit /b %ERRORLEVEL%
