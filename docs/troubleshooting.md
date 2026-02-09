# Troubleshooting Guide

This guide provides solutions to common issues encountered during development, testing, and deployment of the CS301-ITSA-Scroogebank-CRM system.

---

## 📋 Table of Contents

- [Environment Setup Issues](#environment-setup-issues)
- [Docker and Container Issues](#docker-and-container-issues)
- [Kubernetes and kind Issues](#kubernetes-and-kind-issues)
- [Build and Test Failures](#build-and-test-failures)
- [Database Connection Issues](#database-connection-issues)
- [Frontend Development Issues](#frontend-development-issues)
- [CI/CD Issues](#cicd-issues)
- [Network and Ingress Issues](#network-and-ingress-issues)
- [Diagnostic Commands](#diagnostic-commands)

---

## 🔧 Environment Setup Issues

### Issue: Python not found

**Symptoms:**
```
'python' is not recognized as an internal or external command
```

**Solutions:**

**Windows:**
```powershell
# Install Python 3.12
winget install Python.Python.3.12

# Verify installation
python --version
```

**macOS:**
```bash
# Install Python 3.12
brew install python@3.12

# Verify installation
python3 --version
```

**Linux (Ubuntu/Debian):**
```bash
# Install Python 3 and tools
sudo apt install python3 python3-pip python3-venv

# Verify installation
python3 --version
```

**See:** [Python Requirement Guide](prerequisites/PYTHON-REQUIREMENT.md)

---

### Issue: Docker not installed or not running

**Symptoms:**
```
Cannot connect to the Docker daemon
docker: command not found
```

**Solutions:**

1. **Install Docker Desktop:**
   - Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
   - macOS: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
   - Linux: [Docker Engine](https://docs.docker.com/engine/install/)

2. **Start Docker Desktop:**
   - Windows: Start Docker Desktop from Start Menu
   - macOS: Start Docker Desktop from Applications
   - Linux: `sudo systemctl start docker`

3. **Verify Docker is running:**
   ```bash
   docker info
   docker ps
   ```

---

### Issue: Tools not found (kubectl, helm, kind)

**Symptoms:**
```
kubectl: command not found
helm: command not found
kind: command not found
```

**Solution:**

Run the automated setup script:

```bash
python scripts/pipelines/setup_dev_env.py
```

**What it does:**
- Detects missing tools
- Installs them to `.devtools/bin/`
- Updates PATH for the session
- Verifies installation

**Check only (no installation):**
```bash
python scripts/pipelines/setup_dev_env.py --doctor
```

**Manual installation:**
- kubectl: [Install kubectl](https://kubernetes.io/docs/tasks/tools/)
- Helm: [Install Helm](https://helm.sh/docs/intro/install/)
- kind: [Install kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- kubeconform: [Install kubeconform](https://github.com/yannh/kubeconform#installation)

---

### Issue: Module not found: scripts.core

**Symptoms:**
```python
ModuleNotFoundError: No module named 'scripts.core'
```

**Solution:**

Ensure you're running scripts from the **repository root**:

```bash
# Wrong (from subdirectory)
cd scripts/pipelines
python test_all.py  # ❌ Fails

# Correct (from repo root)
cd /path/to/repo
python scripts/pipelines/test_all.py  # ✅ Works
```

**Verify Python can find the module:**
```bash
python -c "import scripts.core.platform; print('OK')"
```

---

## 🐳 Docker and Container Issues

### Issue: Docker daemon not running

**Symptoms:**
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution:**

**Windows:**
```powershell
# Start Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait ~30 seconds, then verify
docker info
```

**macOS:**
```bash
# Start Docker Desktop
open -a Docker

# Wait ~30 seconds, then verify
docker info
```

**Linux:**
```bash
# Start Docker service
sudo systemctl start docker

# Enable auto-start
sudo systemctl enable docker

# Verify
docker info
```

---

### Issue: Docker build fails on Windows (Python service)

**Symptoms:**
```
ERROR: failed to solve: failed to compute cache key: failed to walk /var/lib/docker/tmp/buildkit-mount.../services/backend/log/venv: lstat venv/lib64: no such file or directory
```

**Root cause:** Python `venv/lib64` symlink breaks Docker build context on Windows

**Solution:**

Already fixed! The `.dockerignore` file in `services/backend/log/` excludes `venv/`:

```
# services/backend/log/.dockerignore
venv/
__pycache__/
*.pyc
.pytest_cache/
```

**If issue persists:**
```bash
# Remove venv and rebuild
cd services/backend/log
rm -rf venv .venv
python -m venv venv
pip install -r requirements.txt
```

---

### Issue: Deployment fails with "No such file or directory" on Windows

**Symptoms:**
```
scripts/platform/kind-up.sh: line 32: /c/Program: No such file or directory
make: *** [Makefile:53: kind-up] Error 1
```

**Root cause:** Paths with spaces (like `C:\Program Files\Git`) were not properly handled in bash scripts and Make variables.

**Solution:**

✅ **Already fixed!** (As of February 2026)

The deployment scripts now fully support paths with spaces, including:
- Git Bash in `C:\Program Files\Git`
- Docker Desktop in `C:\Program Files\Docker`
- Repository paths with spaces

**What was fixed:**
1. **PowerShell scripts**: Make SHELL variable now escapes spaces
2. **Bash scripts**: All variable expansions properly quoted
3. **Path detection**: Scripts auto-detect both Git Bash and WSL bash

**Verify your setup:**
```powershell
# Check if Git Bash is detected correctly
where.exe bash

# Should show one of:
# - C:\Program Files\Git\bin\bash.exe (Git Bash - recommended)
# - C:\Windows\System32\bash.exe (WSL bash - supported)

# Run deployment to test
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

**If still encountering issues:**
1. Ensure Git for Windows is installed: `winget install Git.Git`
2. Restart your terminal to refresh PATH
3. Run setup again: `.\scripts\dev-setup\setup.ps1`

**See also:**
- [Windows Path Compatibility](onboarding/new-dev-setup.md#windows-path-compatibility) in setup guide
- [WSL Support FAQ](onboarding/new-dev-setup.md#q-can-i-use-wsl-windows-subsystem-for-linux) for WSL users

---

### Issue: Permission denied accessing Docker socket

**Symptoms:**
```
permission denied while trying to connect to the Docker daemon socket
```

**Solution (Linux only):**

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in, then verify
docker ps
```

---

## ☸️ Kubernetes and kind Issues

### Issue: kind cluster creation fails (cluster already exists)

**Symptoms:**
```
ERROR: node(s) already exist for a cluster with the name "cs301-crm"
```

**Solutions:**

**Option 1: Delete and recreate**
```bash
kind delete cluster --name cs301-crm
kind create cluster --config platform/k8s/infra/kind-config.yaml
```

**Option 2: Use existing cluster**
```bash
# Just verify context and proceed
kubectl config use-context kind-cs301-crm
kubectl cluster-info
```

---

### Issue: kind cluster unreachable after creation

**Symptoms:**
```
Unable to connect to the server: dial tcp [::1]:6443: connect: connection refused
```

**Solutions:**

1. **Verify cluster is running:**
   ```bash
   kind get clusters
   docker ps | grep cs301-crm
   ```

2. **Switch to correct context:**
   ```bash
   kubectl config use-context kind-cs301-crm
   kubectl cluster-info
   ```

3. **Recreate cluster:**
   ```bash
   kind delete cluster --name cs301-crm
   python scripts/pipelines/deploy_k8s.py
   ```

---

### Issue: Pods stuck in ImagePullBackOff

**Symptoms:**
```
$ kubectl get pods -n dev
NAME                    READY   STATUS             RESTARTS   AGE
agent-xxx               0/1     ImagePullBackOff   0          2m
```

**Root cause:** Images not loaded into kind cluster

**Solution:**

```bash
# Rebuild and load images
make build-images
make kind-load

# Restart deployments
kubectl rollout restart deployment/agent -n dev
kubectl rollout restart deployment/client -n dev
kubectl rollout restart deployment/log -n dev
kubectl rollout restart deployment/transaction -n dev
kubectl rollout restart deployment/frontend -n dev

# Wait for rollout
kubectl rollout status deployment/agent -n dev --timeout=180s
```

**Verify images are loaded:**
```bash
docker exec -it cs301-crm-control-plane crictl images | grep dev
```

---

### Issue: Pods crash loop (CrashLoopBackOff)

**Symptoms:**
```
NAME                    READY   STATUS             RESTARTS   AGE
client-xxx              0/1     CrashLoopBackOff   5          5m
```

**Diagnosis:**

1. **Check pod logs:**
   ```bash
   kubectl logs deployment/client -n dev --tail=100
   ```

2. **Check pod events:**
   ```bash
   kubectl describe pod -n dev -l app=client
   ```

3. **Check recent events:**
   ```bash
   kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -20
   ```

**Common causes:**
- Database connection failure → [See Database Issues](#database-connection-issues)
- Missing environment variables → [See Configuration Issues](#issue-missing-environment-variables)
- Application startup failure → Check logs

---

### Issue: Ingress endpoint unreachable (localhost)

**Symptoms:**
```bash
curl http://localhost
curl: (7) Failed to connect to localhost port 80: Connection refused
```

**Diagnosis:**

1. **Check ingress controller:**
   ```bash
   kubectl get pods -n ingress-nginx
   kubectl get svc -n ingress-nginx
   ```

2. **Check ingress resource:**
   ```bash
   kubectl get ingress -n dev
   kubectl describe ingress backend-ingress -n dev
   ```

**Solutions:**

**If ingress-nginx pod not running:**
```bash
# Reinstall ingress-nginx
helm uninstall ingress-nginx -n ingress-nginx
make infra-up
```

**If ingress exists but not routing:**
```bash
# Check backend services
kubectl get svc -n dev

# Verify service selectors match pod labels
kubectl get pods -n dev --show-labels
```

**Fallback: Port-forward directly to service**
```bash
kubectl port-forward -n dev svc/agent-service 8080:8080
curl http://localhost:8080/health
```

---

## 🔨 Build and Test Failures

### Issue: Gradle tests fail

**Symptoms:**
```
> Task :test FAILED
FAILURE: Build failed with an exception.
```

**Diagnosis:**

1. **Check test reports:**
   ```
   services/backend/<service>/build/reports/tests/test/index.html
   ```

2. **Run tests with verbose output:**
   ```bash
   cd services/backend/<service>
   ./gradlew clean test --info
   ```

**Common causes:**
- Missing test dependencies → Check `build.gradle`
- Database connection in tests → Use H2 in-memory or mocks
- Test data issues → Check test fixtures

---

### Issue: Frontend tests fail

**Symptoms:**
```
FAIL src/components/AgentList.test.tsx
```

**Diagnosis:**

```bash
cd services/frontend/crm-ui

# Run tests with verbose output
npm run test -- --reporter=verbose

# Run specific test file
npm run test -- AgentList.test.tsx
```

**Common causes:**
- Missing mock data → Check test setup
- Component prop issues → Verify prop types
- API mocking not working → Check MSW setup

---

### Issue: Python encoding errors on Windows

**Symptoms:**
```
UnicodeDecodeError: 'charmap' codec can't decode byte...
```

**Solution:**

Already handled automatically! All Python pipelines call `setup_windows_encoding()`:

```python
# Automatically sets UTF-8 encoding on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
```

**If issue persists:**
```powershell
# Set environment variables
$env:PYTHONIOENCODING="utf-8"
python scripts/pipelines/test_all.py
```

---

### Issue: Checkstyle or linting failures

**Symptoms:**
```
> Task :checkstyleMain FAILED
Checkstyle rule violations were found.
```

**Solution:**

**Java (Checkstyle):**
```bash
cd services/backend/<service>

# View violations
./gradlew checkstyleMain checkstyleTest

# Check report
open build/reports/checkstyle/main.html  # macOS
start build/reports/checkstyle/main.html  # Windows
```

Fix violations manually or configure IDE to use Checkstyle config:
```
config/checkstyle/checkstyle.xml
```

**Python (flake8, black):**
```bash
cd services/backend/log

# Auto-format with black
black .

# Check linting
flake8 .
```

**Frontend (ESLint, Prettier):**
```bash
cd services/frontend/crm-ui

# Auto-fix linting
npm run lint:fix

# Auto-format
npm run format
```

---

## 🗄️ Database Connection Issues

### Issue: Service can't connect to PostgreSQL

**Symptoms:**
```
Caused by: org.postgresql.util.PSQLException: Connection to localhost:5432 refused
```

**Diagnosis:**

1. **Check PostgreSQL pod:**
   ```bash
   kubectl get pods -n dev -l app.kubernetes.io/name=postgresql
   kubectl logs -n dev -l app.kubernetes.io/name=postgresql --tail=50
   ```

2. **Check service:**
   ```bash
   kubectl get svc -n dev -l app.kubernetes.io/name=postgresql
   ```

3. **Test connectivity from inside cluster:**
   ```bash
   kubectl run -it --rm debug --image=postgres:15 --restart=Never -n dev -- \
     psql -h postgres-postgresql.dev.svc.cluster.local -U postgres -d crm_db
   # Password: postgres
   ```

**Solutions:**

**If PostgreSQL pod not running:**
```bash
# Reinstall PostgreSQL
helm uninstall postgres -n dev
make infra-up
```

**If connection refused:**
- Check service name in application config (`postgres-postgresql.dev.svc.cluster.local`)
- Check credentials match Helm values (`platform/k8s/infra/helm-values/postgres-values.yaml`)

**If database doesn't exist:**
```bash
# Connect to PostgreSQL and create database
kubectl exec -it -n dev postgres-postgresql-0 -- psql -U postgres
CREATE DATABASE crm_db;
\q
```

---

### Issue: Database schema not initialized

**Symptoms:**
```
org.postgresql.util.PSQLException: ERROR: relation "agents" does not exist
```

**Solution:**

Services use JPA/Hibernate or SQLAlchemy to auto-create schemas. Ensure:

**Java services:**
```yaml
# application.yml
spring:
  jpa:
    hibernate:
      ddl-auto: update  # or create-drop for dev
```

**Python service:**
```python
# SQLAlchemy models with Base.metadata.create_all()
```

**Manual schema creation (if needed):**
```bash
kubectl exec -it -n dev postgres-postgresql-0 -- psql -U postgres -d crm_db

CREATE TABLE agents (...);
CREATE TABLE clients (...);
# etc.
```

---

## 🎨 Frontend Development Issues

### Issue: npm install fails

**Symptoms:**
```
npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path /path/to/package.json
```

**Solution:**

```bash
cd services/frontend/crm-ui

# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

---

### Issue: Vite dev server not accessible

**Symptoms:**
```
VITE v6.x.x ready in xxx ms
➜  Local:   http://localhost:3000/
# But browser shows "connection refused"
```

**Solution:**

**Check if port 3000 is already in use:**
```bash
# Windows
netstat -ano | findstr :3000

# macOS/Linux
lsof -i :3000
```

**Kill process using port 3000:**
```bash
# Windows
taskkill /PID <PID> /F

# macOS/Linux
kill -9 <PID>
```

**Or use a different port:**
```bash
npm run dev -- --port 3001
```

---

### Issue: E2E tests fail (Playwright)

**Symptoms:**
```
Error: browserType.launch: Executable doesn't exist
```

**Solution:**

```bash
cd services/frontend/crm-ui

# Install Playwright browsers
npx playwright install

# Run E2E tests
npm run e2e
```

---

## 🚀 CI/CD Issues

### Issue: GitHub Actions workflow fails

**Symptoms:**
- Tests pass locally but fail in CI
- Docker build fails in CI
- K8s deployment fails in CI

**Diagnosis:**

1. **Check workflow logs** in GitHub Actions tab
2. **Download artifacts** (test logs, coverage reports, deployment logs)
3. **Reproduce locally** using the same commands

**See:** [CI/CD Debugging Guide](testing/ci/debugging.md)

---

### Issue: Workflow stuck or times out

**Symptoms:**
```
Error: The operation was canceled.
```

**Common causes:**
- Docker image build timeout → Increase timeout or optimize Dockerfile
- kubectl wait timeout → Increase rollout status timeout
- Test timeout → Increase test timeout or fix slow tests

**Solution:**

Increase timeout in workflow file:
```yaml
jobs:
  test:
    timeout-minutes: 60  # Increase from default 30
```

---

## 🌐 Network and Ingress Issues

### Issue: Service-to-service communication fails

**Symptoms:**
```
Connection refused when calling http://client-service:8081
```

**Solution:**

Use fully-qualified service names:
```
http://client-service.dev.svc.cluster.local:8081
```

**Verify service DNS:**
```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
  nslookup client-service.dev.svc.cluster.local
```

**Verify service endpoints:**
```bash
kubectl get endpoints -n dev client-service
```

---

### Issue: Ingress path routing not working

**Symptoms:**
```
curl http://localhost/api/agents
# Returns 404 instead of agent list
```

**Diagnosis:**

```bash
# Check ingress configuration
kubectl describe ingress backend-ingress -n dev

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=100
```

**Solution:**

Verify ingress paths match service paths:
```yaml
# Ingress rule
- path: /api/agents
  backend:
    service:
      name: agent-service
      port: 8080

# Service must handle /api/agents, not just /agents
```

---

## 🛠️ Diagnostic Commands

### Quick Health Check

```bash
# Check all pods
kubectl get pods -A

# Check services in dev namespace
kubectl get svc -n dev

# Check ingress
kubectl get ingress -n dev

# Check recent events
kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -20
```

### Deep Dive Diagnostics

```bash
# Pod logs
kubectl logs deployment/<service> -n dev --tail=100

# Pod description (for events, resource usage)
kubectl describe pod -n dev -l app=<service>

# Service endpoints (to verify pod selection)
kubectl get endpoints -n dev <service>

# Test connectivity from inside cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
  curl -v http://<service>.<namespace>.svc.cluster.local:<port>/<path>
```

### Docker Diagnostics

```bash
# List Docker containers
docker ps -a

# Check kind cluster containers
docker ps | grep cs301-crm

# View Docker logs
docker logs <container-id>

# Execute into kind node
docker exec -it cs301-crm-control-plane bash
```

---

## 🆘 Still Stuck?

If you can't resolve the issue:

1. **Check existing documentation:**
   - [Local K8s Development](local-k8s-dev.md)
   - [Testing Guide](testing/TESTING-GUIDE.md)
   - [CI/CD Workflows](testing/ci-cd-workflows.md)

2. **Run doctor mode:**
   ```bash
   python scripts/pipelines/setup_dev_env.py --doctor
   ```

3. **Search existing issues:**
   - [GitHub Issues](https://github.com/cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3/issues)

4. **Open a new issue:**
   - Include error messages
   - Include diagnostic command output
   - Describe steps to reproduce

5. **Ask the team:**
   - Post in team chat with error details

---

**Last Updated:** February 2026

**Back to:** [Documentation Hub](README.md) | [Main README](../README.md)
