# Build and Deploy K8s Local Scripts

> **⚠️ DEPRECATED - Legacy Scripts**
>
> This directory contains legacy PowerShell/Bash scripts that have been superseded by
> unified cross-platform Python pipelines.
>
> **Use Instead:** `python scripts/pipelines/deploy_k8s.py`
>
> **Migration Guide:** [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)
>
> **Removal Date:** August 8, 2026
>
> ---
>
> **Historical Documentation Below** (for reference only)

Automated scripts for building, deploying, and validating the CRM application to a local Kubernetes cluster (kind).

## Scripts

### `build-and-deploy-k8s-local.ps1` (Windows PowerShell)
### `build-and-deploy-k8s-local.sh` (Bash - macOS/Linux)

Complete end-to-end deployment pipeline that:
1. Validates Kubernetes manifests
2. Creates/verifies kind cluster
3. Installs infrastructure (ingress, metrics-server, PostgreSQL)
4. Builds Docker images for all services
5. Loads images into kind cluster
6. Deploys application workloads
7. Runs smoke tests (infrastructure + probes)
8. **Generates comprehensive HTML deployment summary report** (requires Python)
9. Tears down cluster on success

## Usage

### Normal Run (Teardown on Success)

**Windows:**
```powershell
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

**macOS/Linux:**
```bash
bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

**Via wrapper (from repository root):**
```cmd
.\scripts\build-and-deploy-k8s-local.cmd
```

### Keep Mode (Preserve Cluster for Debugging)

**Windows:**
```powershell
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1 -Keep
```

**macOS/Linux:**
```bash
KEEP_CLUSTER=1 bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

#### Why Keep Mode Exists

Kubernetes failures are state-based. When a deploy fails, the most useful evidence is inside the cluster:
pod states, events, first-crash logs, probe failures, and live service DNS/network behavior.
If the deploy script tears the cluster down immediately, it deletes the "crime scene" and forces
developers into slow reruns and guesswork. Keep mode preserves the cluster on failure so you can inspect
state with `kubectl describe/logs/events`, iterate using `helm upgrade`, and rerun smoke tests without
recreating the entire environment.

**Behavior:**
- **With `-Keep` (PowerShell) or `KEEP_CLUSTER=1` (bash):** Cluster is preserved on both success and failure
- **Without Keep mode:** Cluster is torn down on success, but **preserved on failure** (to enable debugging)
- **On failure:** Detailed diagnostics are printed automatically (pod status, events, logs)

#### Debug Quick Reference

When the cluster is preserved after a failure, use these commands to investigate:

```bash
# Check pod status
kubectl get pods -n dev -o wide

# Check recent events (most helpful for deployment issues)
kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -200

# Describe a failing pod
kubectl describe pod <pod-name> -n dev

# View logs from a pod
kubectl logs <pod-name> -n dev --tail=100 --all-containers=true

# Check services and ingress
kubectl get svc,ingress -n dev

# List Helm releases
helm list -n dev
```

#### Iterating on Fixes (Keep Mode Workflow)

1. **Fix the issue** in code or manifests
2. **Rebuild images:**
   ```bash
   make build-images && make kind-load
   ```
3. **Redeploy:**
   ```bash
   make deploy-dev
   ```
4. **Rerun smoke tests:**
   ```bash
   make smoke
   ```

#### Cleanup After Keep Mode

When you're done debugging and want to remove the cluster:

```bash
kind delete cluster --name cs301-crm
```

## Prerequisites

### Required
- Docker Desktop (or Docker Engine) running
- kind
- kubectl
- Helm v3
- GNU Make
- Git Bash (Windows only)
- Java 21 (for Gradle builds)

### Optional
- **Python 3.7+** - For comprehensive HTML deployment summary reports

## Python Setup (Optional but Recommended)

The scripts generate comprehensive HTML summary reports that aggregate:
- K8s manifest validation results
- Deployment rollout status
- Probe diagnostics (readiness, liveness, startup)
- In-cluster health check results
- Detailed failure diagnostics

This feature requires Python 3.7 or higher.

### Windows Installation

If you see this warning:
```
Python was not found; run without arguments to install from the Microsoft Store...
Python not found or not working; skipping probe summary report generation.
```

**Option 1: Install via winget (Recommended)**
```powershell
winget install Python.Python.3.12
```

**Option 2: Download from python.org**
1. Visit https://www.python.org/downloads/
2. Download Python 3.12 (or latest)
3. Run installer and **check "Add Python to PATH"**
4. Restart your terminal

**Verify Installation:**
```powershell
python --version
# Should show: Python 3.12.x
```

### macOS Installation
```bash
# Using Homebrew
brew install python3

# Verify
python3 --version
```

### Linux Installation
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3

# Fedora/RHEL
sudo dnf install python3

# Verify
python3 --version
```

## Features
Deployment Reporting
When Python is available, the scripts automatically generate comprehensive HTML summary reports:

**`summary-k8s-deploy__<timestamp>.html`** (Primary Report)
- **Overall deployment status** with visual indicators
- **Validation results** - kubeconform, helm template, kind config
- **Rollout status** - all deployments/statefulsets
- **Probe presence checks** - readiness, liveness, startup probes
- **In-cluster health checks** - HTTP endpoint validation
- **Detailed failure diagnostics** with timestamps and logs
- **Color-coded status** for quick issue identification
- **Responsive design** with modern UI

**`probe-diagnostics-summary.html`** (Legacy - for backward compatibility)
- Focused probe diagnostics
- Color-coded status indicators
- HTTP response details for failed endpoints

**Report Location:**
```
build-logs/build-and-deploy-k8s/summary-k8s-deploy__<timestamp>.html
build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html
```

**Report Rotation:**
Only the 3 most recent reports of each type are kept. Older reports are automatically deleted.

**View Report (Windows):**
```powershell
# Open the latest summary report
Start-Process (Get-ChildItem build-logs\build-and-deploy-k8s\summary-k8s-deploy__*.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

**View Report (macOS/Linux):**
```bash
# Open the latest summary report
opSummary reports with timestamped filenames for easy retrieval
- Inverse timestamp naming for chronological log sorting
- Automatic rotation (keeps 3 most recent logs and 3 most recent report
xdg-open "$(ls -t build-logs/build-and-deploy-k8s/summary-k8s-deploy__*.html | head -1)".html
```

**View Report (macOS/Linux):**
```bash
open build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html
# or
xdg-open build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html
```

### Log Management
- Comprehensive summary reports with failure detailin `build-logs/build-and-deploy-k8s/`
- Inverse timestamp naming for chronological sorting
- Automatic rotation (keeps 3 most recent logs)
- UTF-8 encoding with mojibake repair (Windows)

### Graceful Teardown
On successful deployment and smoke tests:
- Deletes application workloads
- Uninstalls Helm releases (postgres, ingress-nginx, metrics-server)
- Deletes kind cluster
- Ensures clean state for next run

On failure:
- Preserves cluster for debugging
- Detailed diagnostics in logs
- Probe failure reports (if Python available)
 and Reports

### Build Logs
All execution logs are stored in:
```
build-logs/build-and-deploy-k8s/inv<timestamp>__<readable-timestamp>__build-and-deploy-k8s-local.log
```

Logs include:
- K8s manifest validation results
- Helm installation output
- Docker build progress
- Pod rollout status
- Smoke test results
- Probe check details
- Teardown operations

### Summary Reports
HTML summary reports (requires Python):
```
build-logs/build-and-deploy-k8s/summary-k8s-deploy__<timestamp>.html  (Comprehensive report)
build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html        (Legacy probe report)
```
k8s deploy summary report generation.
```

**Solution:**
Install Python 3.7+ (see Python Setup section above). The scripts will work without Python but won't generate HTML summary
- In-cluster health checks
- Detailed failure diagnostics with logs
- Teardown operations

## Troubleshooting

### Python Not Found Warning
**Symptom:**
```
Python was not found...
Python not found or not working; skipping probe summary report generation.
```

**Solution:**
Install Python 3.7+ (see Python Setup section above). The scripts will work without Python but won't generate HTML reports.

### Cluster Already Exists
**Symptom:**
```
ERROR: failed to create cluster: node(s) already exist for a cluster with the name "cs301-crm"
```**Check the HTML summary report** (if Python installed):
   - Open `build-logs/build-and-deploy-k8s/summary-k8s-deploy__<latest>.html`
   - Review rollout failures section for detailed diagnostics

**Solution:**
```bash
kind delete cluster --name cs301-crm
# Then re-run the script
```

### Rollout Timeout
**Symptom:**
```
deployment/agent rollout timed out or failed
```

**Solution:**
1. Check the HTML diagnostics report (if Python installed)
2. Check pod status: `kubectl get pods -n dev -o wide`
3. Check events: `kubectl get events -n dev --sort-by=.metadata.creationTimestamp`
4. Check logs: `kubectl logs deployment/<service> -n dev --tail=100`

### Docker Not Running
**Symptom:**
```
Docker is not available or the daemon is not running
```

**Solution:**
Start Docker Desktop and wait for it to be fully running, then re-run the script.

### Images Not Loading
**Symptom:**
Pods stay in `ImagePullBackOff` or `ErrImagePull`

**Solution:**
Images may not have been loaded into kind. Re-run the script or manually:
```bash
make kind-load
kubectl rollout restart deployment/<service> -n dev
```

## Exit Codes

- **0**: Deployment, smoke tests, and teardown completed successfully
- **1**: Failure during any phase (validation, build, deploy, smoke, teardown)

When the script exits with code 1, logs will contain detailed diagnostics, and the cluster is preserved for debugging.

## Environment Variables

### For Smoke Tests
Inherited from smoke test scripts:
- `BASE_URL` - Base URL for service endpoints (default: `http://localhost`)
- `JWT_HMAC_SECRET` - HMAC secret for JWT generation (default: `dev-only-insecure-secret`)
- `ROLLOUT_TIMEOUT` - Timeout for rollout status checks (default: `300s`)
- `CURL_IMAGE` - Image for in-cluster probe checks (default: `curlimages/curl:8.5.0`)

### For Build Process
- `MAKE` - Custom make command (default: `make`)
- `NULL_DEVICE` - Null device path (auto-detected)
- `GRADLEW` - Gradle wrapper command (default: `./gradlew`)

## Related Documentation

- [Local K8s Development Guide](../../docs/local-k8s-dev.md) - Comprehensive local setup documentation
- [Smoke Tests README](../smoke-k8s-infra/README.md) - Detailed smoke test documentation
- [ADR-0002](../../docs/architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md) - Standardized local K8s deployment workflow

## See Also

- [Makefile](../../Makefile) - Underlying Make targets
- [test-and-spinup-all](../test-and-spinup-all/) - Full test pipeline with deployment
- [smoke-k8s-infra](../smoke-k8s-infra/) - Standalone smoke tests
