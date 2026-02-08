@echo off
REM Wrapper for K8s deployment pipeline - migrated to Python
REM Old PowerShell script is deprecated - see docs/migration/pipeline-migration.md
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
python "scripts\pipelines\deploy_k8s.py" %*
exit /b %ERRORLEVEL%
