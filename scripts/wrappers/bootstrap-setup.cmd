@echo off
REM Bootstrap script to ensure Python is available before running pipelines

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Python Prerequisite Check
echo ========================================
echo.

REM Check if Python is installed
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python found
    python --version
    echo.
    echo Running developer setup...
    python "%~dp0..\pipelines\setup_dev_env.py" %*
    exit /b %ERRORLEVEL%
)

REM Python not found - show installation instructions
echo [ERROR] Python not found!
echo.
echo This project's build scripts require Python 3.8 or higher.
echo.
echo ========================================
echo   How to Install Python on Windows
echo ========================================
echo.
echo Option 1 - Using winget (Recommended):
echo   winget install Python.Python.3.12
echo.
echo Option 2 - Using Chocolatey:
echo   choco install python
echo.
echo Option 3 - Manual Download:
echo   https://www.python.org/downloads/
echo   (Make sure to check "Add Python to PATH" during installation)
echo.
echo ========================================
echo.
echo After installation:
echo   1. Close and reopen this terminal
echo   2. Run this script again
echo.

exit /b 1
