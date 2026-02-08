@echo off
REM Wrapper for all tests pipeline - migrated to Python
REM Old PowerShell script is deprecated - see docs/migration/pipeline-migration.md
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
python "scripts\pipelines\test_all.py" %*
exit /b %ERRORLEVEL%
