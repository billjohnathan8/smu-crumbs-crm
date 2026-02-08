@echo off
REM Wrapper for CI/CD validation pipeline - migrated to Python
REM Old PowerShell script is deprecated - see docs/migration/pipeline-migration.md
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

echo ╔════════════════════════════════════════════════════════════════════════════╗
echo ║               CI/CD Complete Testing Workflow                              ║
echo ╚════════════════════════════════════════════════════════════════════════════╝
echo.

python "scripts\pipelines\validate_ci_cd.py" %*
exit /b %ERRORLEVEL%

set EXIT_CODE=%ERRORLEVEL%
popd
endlocal
exit /b %EXIT_CODE%
