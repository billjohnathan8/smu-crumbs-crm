@echo off
REM Wrapper for backend test pipeline (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\test_backend.py" %*
