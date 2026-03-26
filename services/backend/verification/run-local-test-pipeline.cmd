@echo off
setlocal

python run-local-test-pipeline.py
if errorlevel 1 exit /b %errorlevel%

endlocal
