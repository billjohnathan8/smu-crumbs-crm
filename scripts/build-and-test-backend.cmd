@echo off
REM Wrapper for backend test pipeline - migrated to Python
REM Old PowerShell script is deprecated - see docs/migration/pipeline-migration.md
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
python "scripts\pipelines\test_backend.py" %*
exit /b %ERRORLEVEL%
