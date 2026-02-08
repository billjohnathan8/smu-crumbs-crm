@echo off
REM Wrapper script to run the Bash version of test-ci-cd-github.sh on Windows
REM This script uses Git Bash if available

setlocal

REM Check if Git Bash is available
set "GIT_BASH=C:\Program Files\Git\bin\bash.exe"
if exist "%GIT_BASH%" (
    echo Running test-ci-cd-github.sh using Git Bash...
    "%GIT_BASH%" "%~dp0test-ci-cd-github.sh" %*
) else (
    echo ERROR: Git Bash not found at: %GIT_BASH%
    echo.
    echo Please either:
    echo   1. Install Git for Windows from https://git-scm.com/
    echo   2. Use the PowerShell version: test-ci-cd-github.ps1
    echo.
    exit /b 1
)

endlocal
exit /b %ERRORLEVEL%
