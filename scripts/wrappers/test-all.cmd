@echo off
REM Wrapper for unified build pipeline (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\test_all.py" %*
