@echo off
REM Wrapper for K8s deployment pipeline (Windows)
cd /d "%~dp0..\.."
python "scripts\pipelines\deploy_k8s.py" %*
