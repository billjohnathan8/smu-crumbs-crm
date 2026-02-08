# Quick Testing Reference Card

## ⚠️ Prerequisites

**Python 3.8+ required!** If not installed:
```powershell
winget install Python.Python.3.12  # Windows
brew install python@3.12           # macOS
sudo apt install python3           # Linux
```

## 🚀 Essential Commands

```powershell
# 1. Validate Phase 1 platform abstraction
python scripts\core\validate_platform.py

# 2. Test backend services
python scripts\pipelines\test_backend.py

# 3. Test frontend (skip slow E2E tests)
python scripts\pipelines\test_frontend.py --skip-e2e

# 4. Test everything in parallel
python scripts\pipelines\test_all.py --parallel

# 5. Deploy to local K8s (keep cluster for debugging)
python scripts\pipelines\deploy_k8s.py --keep

# 6. Set up development environment
python scripts\pipelines\setup_dev_env.py --doctor

# 7. Validate CI/CD locally
python scripts\pipelines\validate_ci_cd.py --local-only

# 8. Full test + deployment
python scripts\pipelines\test_all.py --skip-e2e && python scripts\pipelines\deploy_k8s.py --keep
```

## 📊 Where to Find Reports

| Pipeline | Report Location |
|----------|----------------|
| Backend tests | `build-logs/test-backend/index.html` |
| Frontend tests | `build-logs/test-frontend/index.html` |
| All tests | `build-logs/test-all/index.html` |
| K8s deployment | `build-logs/deploy-k8s/summary-*.html` |
| Platform validation | Console output + `build-logs/validation/*.html` |
| CI/CD validation | `build-logs/validate-ci-cd/*.html` |

## 🐛 Quick Fixes

```powershell
# Docker not running?
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Kind cluster stuck?
kind delete cluster --name cs301-crm

# GitHub CLI not authenticated?
gh auth login

# Module import errors?
cd c:\code\work\smu-cs301-project\project-2025-26-t2-project-2025-26t2-g2-t3

# Clear Python cache?
Remove-Item -Recurse -Force scripts\**\__pycache__
```

## ⏱️ Expected Durations

- Backend tests: **~3-5 min** (faster with Python)
- Frontend tests (no E2E): **~3-5 min**  
- Frontend tests (with E2E): **~8-12 min**
- All tests (parallel): **~6-10 min**
- K8s deploy: **~6-10 min**
- Full CI/CD validation: **~30-45 min**

*Note: Python pipelines are ~20-30% faster than old PowerShell/Bash scripts*

## 📝 Full Guide

See [TESTING-GUIDE.md](TESTING-GUIDE.md) for comprehensive testing instructions.
