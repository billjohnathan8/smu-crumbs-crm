@echo off
REM Wrapper for frontend test pipeline (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\test_frontend.py" %*
