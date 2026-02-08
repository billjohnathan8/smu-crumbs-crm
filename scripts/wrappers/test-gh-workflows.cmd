@echo off
REM Wrapper for GitHub workflow testing (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\test_github_workflows.py" %*
