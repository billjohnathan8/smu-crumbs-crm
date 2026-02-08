@echo off
REM Wrapper for CI/CD validation pipeline (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\validate_ci_cd.py" %*
