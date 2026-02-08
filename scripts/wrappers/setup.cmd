@echo off
REM Wrapper for developer setup (Windows)
REM Usage: scripts\wrappers\setup.cmd [OPTIONS]

cd /d "%~dp0..\.."
python "scripts\pipelines\setup_dev_env.py" %*
