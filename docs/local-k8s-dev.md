# Local Kubernetes Backend Development (kind)

This is the canonical runbook for local Kubernetes development in this repository.

## Overview

This guide covers local Kubernetes deployment using **kind** (Kubernetes in Docker). The local flow is fully self-contained and does not require AWS resources. All infrastructure (ingress, metrics, database) runs locally in Docker containers.

**What you'll learn:**
- One-command deployment with automated testing and teardown
- Step-by-step manual deployment for debugging
- Comprehensive smoke testing (infrastructure + probe validation)
- Troubleshooting common failure scenarios
- Service onboarding checklist

Notes: 
- We use primarily python for cross-platform local pipeline scripts
- We use shellscript wrappers to run local pipelines.

**Deploy Pipeline Stages:**
1. K8s Validate
2. `infra-up` via `kind`
3. `make up`
4. K8s Probe Tests
5. K8s Smoke Tests

**Quick start:**
```bash
# Standard deployment (with automatic pre-pull, recommended)
python scripts/pipelines/deploy_k8s.py

# Verbose mode for troubleshooting or first-time setup
python scripts/pipelines/deploy_k8s.py --verbose

# First-time setup script (comprehensive tracing)
.\scripts\first-time-setup.ps1  # Windows
./scripts/first-time-setup.sh   # Linux/macOS
```

**Using Makefile:**
```bash
# Standard deployment
make build-and-deploy-local

# With verbose tracing
make build-and-deploy-local-verbose

# Skip pre-pull (not recommended for fresh machines)
make build-and-deploy-local-no-prepull
```

**Legacy wrappers (deprecated, use Python above):**
```powershell
# Windows
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

```bash
# macOS/Linux
bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

> **Note:** Legacy scripts are deprecated and will be removed August 8, 2026.
> See [Migration Guide](migration/pipeline-migration.md) for details.

> **🆕 Feb 2026 Update:** Infrastructure image pre-pull is now **enabled by default** to prevent timeout failures on fresh machines. This adds 3-5 minutes on first run but prevents 10+ minute Helm timeouts. See [Image Pre-Pull Guide](deployment/image-prepull.md) for details.

The local flow does not require AWS resources. AWS-oriented architecture docs exist separately for target-state planning.

## Canonical Paths and Configuration

### Repository Structure
- **Cluster config**: `platform/k8s/infra/kind-config.yaml`
- **Infra Helm values**: `platform/k8s/infra/helm-values/*.yaml`
- **App base manifests**: `platform/k8s/apps/base`
- **Dev overlay**: `platform/k8s/apps/overlays/dev` (active local overlay)

### Default Settings
- **Namespace**: `dev`
- **Kind cluster name**: `cs301-crm` (defined in kind-config.yaml)
- **Ingress**: `http://localhost` (via ingress-nginx controller)

### Deprecated Paths
Do not use `platform/k8s-apps/*` (legacy path, has been removed).

## Prerequisites

### Required Tools
- **Docker Desktop** (or Docker Engine) — Must be running
- **kind** — Kubernetes in Docker cluster tool
- **kubectl** — Kubernetes CLI
- **Helm v3** — Kubernetes package manager
- **kubeconform** — K8s manifest schema validator (for `make k8s-validate`)
- **GNU Make** — Build automation
- **Bash** and **curl** — Shell scripting and HTTP testing
- **Java 21** — For Gradle wrapper builds (backend services)

### Optional Tools
- **Python 3.7+** — For HTML deployment summary and probe diagnostics reports
- **OpenSSL** — For JWT generation in smoke tests (macOS/Linux)

### Windows-Specific Notes
- Use PowerShell or `.cmd` wrappers in `scripts/`
- Install Git for Windows (includes Git Bash) for Makefile compatibility
- Python recommended but optional — install from [python.org](https://www.python.org/downloads/) or via `winget install Python.Python.3.12`
- kubeconform installation: `scoop install kubeconform`
- **PATH handling**: Bash scripts automatically detect Git Bash/WSL and configure PATH
  - Tools installed to `.devtools/bin` are auto-discovered
  - Paths with spaces (like `C:\Program Files\Git`) are fully supported
  - See [../scripts/common/setup-env.sh](../scripts/common/setup-env.sh) for implementation

For detailed tool installation instructions, see [K8s Manifest Validation Guide](testing/k8s-validation.md#installation).

**Troubleshooting Windows PATH issues:** See [WSL PATH inheritance fix](fixes/wsl-path-inheritance-fix.md).

## 🆕 Tracing and Verbose Modes (Feb 2026)

As of February 2026, comprehensive tracing capabilities are available for troubleshooting deployments, especially useful for first-time setup or debugging timeout issues.

### Verbose Deployment Options

#### 1. Python Pipeline with Verbose Flag
```bash
# Shows detailed Helm output, Docker progress, and image verification
python scripts/pipelines/deploy_k8s.py --verbose
```

**What you'll see:**
- Real-time Docker pull progress bars
- Detailed Helm deployment output (`--debug` flag)
- Image size and creation date after each pull
- Full command traces
- Pod status updates during deployment

#### 2. Makefile Verbose Target
```bash
# Enables verbose mode for all deployment steps
make build-and-deploy-local-verbose

# Or use VERBOSE variable with any target
make infra-up VERBOSE=1
make prepull-infra-images VERBOSE=1
```

#### 3. First-Time Setup Script (Recommended for New Machines)
```bash
# Windows
.\scripts\first-time-setup.ps1

# Linux/macOS
./scripts/first-time-setup.sh
```

**Features:**
- Automatic dependency checking
- Verbose tracing enabled by default
- Real-time progress output
- Timestamped logs in `build-logs/first-time-setup/`
- Comprehensive HTML report generation
- ~10-15 minutes on first run (3-5 minutes on subsequent runs)

#### 4. Individual Script Verbose Modes
```bash
# Pre-pull with detailed output
python scripts/platform/prepull-infra-images.py --verbose

# Infrastructure deployment with Helm debug output
python scripts/platform/infra-up.py --verbose
```

### Real-Time Monitoring

While deployment is running, open a **second terminal** to watch events:

```bash
# Watch all pod status changes
kubectl get pods -A --watch

# Watch only error events
kubectl get events -A --watch --field-selector type!=Normal

# Monitor specific namespace
kubectl get pods -n ingress-nginx --watch

# Describe a stuck pod
kubectl describe pod <pod-name> -n ingress-nginx

# Follow container logs
kubectl logs -f <pod-name> -n ingress-nginx
```

### Logging to File

Capture complete output for later analysis:

```bash
# Full verbose deployment with timestamped log
make build-and-deploy-local-verbose 2>&1 | tee deployment-$(date +%Y%m%d-%H%M%S).log

# Python pipeline to file
python scripts/pipelines/deploy_k8s.py --verbose 2>&1 | tee deployment.log

# First-time setup (logs automatically saved)
.\scripts\first-time-setup.ps1
# Logs: build-logs/first-time-setup/setup-YYYYMMDD-HHMMSS.log
```

### Deployment Reports

After any deployment, check the comprehensive HTML report:

```bash
# Open deployment report (Windows)
start build-logs/build-and-deploy-k8s/deployment-report.html

# Linux/macOS
open build-logs/build-and-deploy-k8s/deployment-report.html
xdg-open build-logs/build-and-deploy-k8s/deployment-report.html
```

**Report includes:**
- Timeline with timestamps for each phase
- Success/failure status for each step
- Complete stdout/stderr capture
- Performance metrics (time per step)
- Color-coded status indicators

### Infrastructure Image Pre-Pull (Default)

As of Feb 2026, **image pre-pull is enabled by default** to prevent timeout failures:

**Images pre-pulled (~1-2GB total):**
- `ingress-nginx/controller:v1.14.3` (~800MB-1GB)
- `ingress-nginx/kube-webhook-certgen:v20250202-stable-patch1`
- `metrics-server/metrics-server:v0.8.0`
- `bitnami/postgresql:17.2.0-debian-12-r10`

**Time impact:**
- Fresh machine: +3-5 minutes (prevents 10+ minute timeouts)
- Cached images: <1 minute

**Opt-out (not recommended):**
```bash
python scripts/pipelines/deploy_k8s.py --no-prepull
make build-and-deploy-local-no-prepull
```

See [Image Pre-Pull Guide](deployment/image-prepull.md) for complete documentation.

## Golden path (recommended)

**Cross-platform Python pipeline (recommended):**
```bash
python scripts/pipelines/deploy_k8s.py
```

**Legacy wrappers (deprecated):**
Run one of these from repository root:

```powershell
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

```bash
bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

Notes:
- The wrapper runs the full make-driven deploy plus smoke checks.
- On success: tears down dev workloads and deletes the kind cluster (unless Keep mode is enabled).
- On failure: preserves the cluster and prints diagnostics for debugging.

### Keep Mode (Debugging Failed Deployments)

When debugging deployment issues, use Keep mode to preserve the cluster:

**Cross-platform:**
```bash
python scripts/pipelines/deploy_k8s.py --keep-cluster
```

**Legacy (deprecated):**

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
- **With Keep mode enabled:** Cluster is preserved on both success and failure
- **Without Keep mode:** Cluster is torn down on success, but **preserved on failure** (to enable debugging)
- **On any failure:** Detailed diagnostics are printed automatically (pod status, events, logs, helpful commands)

#### Iterating on Fixes (Keep Mode Workflow)

1. **Inspect the failure** using the diagnostics printed by the script
2. **Fix the issue** in code or manifests
3. **Rebuild images:**
   ```bash
   make build-images && make kind-load
   ```
4. **Redeploy:**
   ```bash
   make deploy-dev
   ```
5. **Rerun smoke tests:**
   ```bash
   make smoke
   ```
6. **Cleanup when done:**
   ```bash
   kind delete cluster --name cs301-crm
   ```

Success criteria:
- Exit code `0`
- Rollout checks pass for `agent`, `client`, `log`, `transaction`
- Smoke output includes `Smoke tests passed.`
- Wrapper output ends with `Local Kubernetes build/deploy and smoke checks completed successfully.`

## One-command test + deploy
Run full test pipeline (backend + frontend), then deploy to local k8s only if tests pass:

**Cross-platform:**
```bash
python scripts/pipelines/test_all.py && python scripts/pipelines/deploy_k8s.py
```

**Legacy wrappers (deprecated):**
```powershell
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1
```

```bash
bash ./scripts/test-and-spinup-all/test-and-spinup-all.sh
```

Notes:
- Runs the full test pipeline (backend + frontend) with coverage reports.
- Logs are captured under `build-logs/build-and-test-all`, `build-logs/build-and-deploy-k8s`, and `build-logs/test-and-spinup-all`.
- The deploy phase uses the same teardown behavior as the deploy-only wrapper (cluster is deleted on success).

## Step-by-step flow (manual)

### 0) Validate Kubernetes manifests (recommended)
```bash
make k8s-validate
```

Validates all K8s manifests **offline** (no cluster required):
- **kind config** — YAML syntax validation
- **Helm charts** — Renders and validates ingress-nginx, metrics-server, postgresql
- **Kustomize overlay** — Renders and validates app deployments via kubeconform

This step runs automatically in deployment scripts. Run it manually to catch configuration errors early.

**For detailed documentation:** [K8s Manifest Validation Guide](testing/k8s-validation.md)

### 1) (Recommended) Run backend build/tests first

**Cross-platform:**
```bash
python scripts/pipelines/test_backend.py
```

**Legacy (deprecated):**
```powershell
.\scripts\build-and-test-backend\build-and-test-backend.ps1
```
```bash
bash ./scripts/build-and-test-backend/build-and-test-backend.sh
```

Runs each service-local pipeline (lint, build, tests, coverage reports):
- `services/backend/agent`: `gradlew localTestPipeline`
- `services/backend/client`: `gradlew localTestPipeline`
- `services/backend/transaction`: `gradlew localTestPipeline`
- `services/backend/log`: `python run-local-test-pipeline.py`

**For detailed documentation:** [Testing Guide](../TESTING-GUIDE.md)

### 2) Create and verify kind cluster
```bash
make kind-up
kind get clusters
kubectl config use-context kind-cs301-crm
kubectl cluster-info
```

If `make kind-up` fails because the cluster already exists, skip to context verification or use the wrapper script (it handles existing clusters automatically).

### 3) Install ingress + infra dependencies
```bash
make infra-up
kubectl get pods -n ingress-nginx
kubectl get pods -n dev
```

`make infra-up` installs:
- `ingress-nginx` in namespace `ingress-nginx`
- `metrics-server` in namespace `kube-system`
- `postgres` (Bitnami chart) in namespace `dev`

### 4) Build backend images
```bash
make build-images
```

Builds:
- `agent:dev`
- `client:dev`
- `log:dev`
- `transaction:dev`
- `crm-ui:dev`

### 5) Load images into kind
```bash
make kind-load
```

### 6) Deploy dev overlay
```bash
make deploy-dev
```

Equivalent raw apply:
```bash
kubectl apply -k platform/k8s/apps/overlays/dev
```

### 7) Verify workloads and ingress routes
```bash
kubectl get deploy,pods,svc,ing -n dev
curl -i http://localhost/health
```

Ingress routes:
- `http://localhost/api/agents` -> `agent-service`
- `http://localhost/api/clients` -> `client-service`
- `http://localhost/api/logs` -> `log-service`
- `http://localhost/api/transactions` -> `transaction-service`
- `http://localhost/` -> `frontend` (React UI)

### 8) Run smoke tests
```bash
make smoke
```

Runs comprehensive validation of deployed services:
1. **Infrastructure smoke** (`make smoke-infra`) — HTTP endpoints, CRUD operations, service integration
2. **Probe-aware smoke** (`make smoke-probes`) — K8s health probes, rollout status, in-cluster health checks

**Quick reference:**
- Run infrastructure smoke only: `make smoke-infra`
- Run probe-aware smoke only: `make smoke-probes`
- Override namespace: `make smoke-probes NS=staging`

**What gets validated:**
- All service health endpoints accessible via ingress
- Client CRUD operations (create, read, update, delete)
- Transaction listing and log ingestion
- All Deployments/StatefulSets rolled out successfully
- All containers have required probes (readiness, liveness, startup)
- HTTP probe endpoints return 2xx status from inside cluster

**On failure:**
Probe-aware smoke generates comprehensive diagnostics:
- **HTML Summary**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
- **JSON Report**: `build-logs/build-and-deploy-k8s/probe-failures.json`
- Categorized failures: rollout, probe presence, in-cluster health
- Pod logs, events, and HTTP response details

**For detailed documentation:**
- [Smoke Testing Guide](testing/smoke/README.md) — Complete smoke test documentation with troubleshooting
- [Smoke Scripts README](../scripts/smoke-k8s-infra/README.md) — Script-level details and environment variables

## Teardown and reset

### Full reset (recommended when things are badly drifted)
```bash
kind delete cluster --name cs301-crm
```

### App-only reset (keep cluster)
```bash
kubectl delete -k platform/k8s/apps/overlays/dev --ignore-not-found
helm uninstall postgres -n dev
helm uninstall ingress-nginx -n ingress-nginx
helm uninstall metrics-server -n kube-system
```

## Common failure modes and debug commands

### Quick Diagnostics Checklist
1. **Check deployment logs**: `build-logs/build-and-deploy-k8s/inv*__*__build-and-deploy-k8s-local.log`
2. **View HTML diagnostics**: Open `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html` in browser
3. **Check pod status**: `kubectl get pods -n dev -o wide`
4. **Check recent events**: `kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -50`
5. **Check logs**: `kubectl logs deployment/<service> -n dev --tail=100`

For comprehensive troubleshooting, see:
- [Smoke Testing Guide - Troubleshooting](testing/smoke/README.md#troubleshooting) — Detailed failure scenarios and solutions
- [K8s Validation Guide - Common Issues](testing/k8s-validation.md#common-validation-issues) — Manifest validation problems

### Cluster and Infrastructure Issues

#### `make kind-up` fails because cluster already exists
**Symptom:**
```
ERROR: node(s) already exist for a cluster with the name "cs301-crm"
```

**Solution:**
```bash
# Verify existing clusters
kind get clusters

# Recreate cleanly
kind delete cluster --name cs301-crm

# Then rerun deploy wrapper
```

#### Ingress endpoint on `localhost` is unreachable
**Diagnosis:**
```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress configuration
kubectl describe ingress backend-ingress -n dev
```

**Solution:**
- Ensure ingress controller is running and ready
- Verify ingress paths match service routes
- Run smoke tests (includes port-forward fallback): `make smoke`

#### Pods stay `ImagePullBackOff` or old image keeps running
**Diagnosis:**
```bash
kubectl describe pod -n dev <pod-name>
```

**Solution:**
```bash
# Confirm images loaded
make kind-load

# Restart deployments
kubectl rollout restart deployment/agent -n dev
kubectl rollout restart deployment/client -n dev
kubectl rollout restart deployment/log -n dev
kubectl rollout restart deployment/transaction -n dev

# Verify rollout
kubectl rollout status deployment/agent -n dev --timeout=180s
```

### Probe and Health Check Failures

For detailed probe troubleshooting, see [Smoke Testing Guide - Probe Failures](testing/smoke/README.md#probe-aware-smoke-failures).

#### Probe-aware smoke fails with missing probes
**Quick fix:**
1. Check HTML diagnostics: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
2. Identify missing probe type and affected container
3. Add probe to `platform/k8s/apps/base/<service>-deployment.yaml`
4. For slow-starting services, add to `scripts/smoke-k8s-infra/startup-probe-required.txt`
5. Re-apply: `kubectl apply -k platform/k8s/apps/overlays/dev`
6. Rerun: `make smoke-probes`

**Example probe configuration:**
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5

livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10

# For slow-starting services (JVM/Spring Boot)
startupProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 0
  periodSeconds: 10
  failureThreshold: 30  # 5 minutes max
```

#### Probe-aware smoke fails with rollout timeout
**Quick diagnosis:**
```bash
# Check HTML diagnostics
Start-Process build-logs\build-and-deploy-k8s\probe-diagnostics-summary.html  # Windows

# Check pod status
kubectl get pods -n dev -o wide

# Check events
kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -50

# Check logs
kubectl logs deployment/<service> -n dev --tail=100
```

**Common causes:**
- Image pull failures → Run `make kind-load`
- Probe configuration too strict → Increase `initialDelaySeconds`
- Application startup failures → Check logs in diagnostics
- Resource constraints → Check pod describe output

#### In-cluster health checks fail
**Quick diagnosis:**
```bash
# Check HTML diagnostics for HTTP status codes and response details
# Manually test endpoint
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
  curl -v http://<service-name>.dev.svc.cluster.local:<port><path>
```

**Common causes:**
- Wrong port → Verify `containerPort` matches application
- Wrong path → Verify probe path in deployment YAML
- Application not ready → Increase `initialDelaySeconds`
- DNS issues → Verify service name and selector

### Application Issues

#### Pods fail readiness/liveness due to DB issues
#### Pods fail readiness/liveness due to DB issues
**Diagnosis:**
```bash
# Check PostgreSQL
kubectl get pods -n dev -l app.kubernetes.io/name=postgresql
kubectl logs -n dev -l app.kubernetes.io/name=postgresql --tail=50

# Check service logs
kubectl logs -n dev -l app=client --tail=100

# Check environment variables
kubectl describe pod -n dev -l app=client | grep -A10 Environment
```

**Solution:**
- Ensure PostgreSQL is running and ready
- Verify database connection strings in service configs
- Check for database migration failures
- Review service logs for SQL errors

#### Windows wrapper fails because Bash or Make is missing
**Solution:**
- Install Git for Windows (includes Git Bash)
- Verify `bash` and `make` are in `PATH`
- Use PowerShell wrapper instead: `.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1`

### Validation Failures

For K8s manifest validation issues, see [K8s Manifest Validation Guide - Common Issues](testing/k8s-validation.md#common-validation-issues).

Common validation failures:
- **Invalid YAML syntax** → Fix syntax errors in manifests
- **Missing required fields** → Check kubeconform output for missing fields
- **Wrong field types** → Ensure types match (e.g., `replicas: 3` not `replicas: "3"`)
- **Helm template errors** → Verify values files match chart requirements

## Service onboarding checklist (for this local flow)

When adding a new backend service to the local Kubernetes deployment:

### 1. Service Code and Container
- [ ] Add service code and Dockerfile under `services/backend/<new-service>`
- [ ] Build and test locally before K8s integration

### 2. Base Kubernetes Manifests
- [ ] Create `platform/k8s/apps/base/<service>-deployment.yaml`
  - **Required**: Include `readinessProbe` and `livenessProbe` for all containers
  - **Conditional**: Add `startupProbe` for slow-starting services (JVM/Spring Boot)
- [ ] Create `platform/k8s/apps/base/<service>-service.yaml`
- [ ] Register in `platform/k8s/apps/base/kustomization.yaml`

**Probe configuration guidance:**
- Use `/health` endpoint for all probes (standardized across services)
- Set appropriate `initialDelaySeconds` based on startup time
- For slow-starting services:
  - Add `startupProbe` with high `failureThreshold` (e.g., 30 × 10s = 5 minutes)
  - List in `scripts/smoke-k8s-infra/startup-probe-required.txt`

### 3. Dev Overlay Configuration
- [ ] Add image tag in `platform/k8s/apps/overlays/dev/kustomization.yaml`
- [ ] Create probe patches if needed: `platform/k8s/apps/overlays/dev/<service>-probes-patch.yaml`
  - Use tighter probe settings for dev environment (faster feedback)
- [ ] Add ingress rules if service is externally accessible

### 4. Build and Deploy Integration
- [ ] Extend `Makefile` targets:
  - Add to `build-images` target (Docker build command)
  - Add to `kind-load` target (load image into kind)
  - Add to `deploy-dev` target (rollout restart)

### 5. Testing Integration
- [ ] Extend `scripts/smoke-k8s-infra/smoke-k8s-infra.sh` (.ps1 for Windows)
  - Add health check for new service
  - Add service-specific integration tests (CRUD, endpoints, etc.)
- [ ] Probe-aware smoke automatically validates probes and rollout (no manual extension needed)

### 6. Validation
- [ ] Run `make k8s-validate` to check manifests offline
- [ ] Run `make build-and-deploy-local` for full integration test
- [ ] Verify smoke tests pass with new service
- [ ] Review HTML diagnostics to ensure probes are correct

**For detailed probe configuration examples, see:**
- [Smoke Testing Guide - Missing Probe Fix](testing/smoke/README.md#missing-probe)
- [Local K8s Dev - Probe Configuration](local-k8s-dev.md#probe-and-health-check-failures)

## Related Documentation

### Core Guides
- [Smoke Testing Guide](testing/smoke/README.md) — Comprehensive smoke test documentation and troubleshooting
- [K8s Manifest Validation](testing/k8s-validation.md) — Offline manifest validation with kubeconform
- [Testing Guide](../TESTING-GUIDE.md) — Cross-platform Python pipeline testing
- [Migration Guide](migration/pipeline-migration.md) — PowerShell/Bash → Python migration

### Scripts and Pipelines
- [Build and Deploy Scripts](../scripts/build-and-deploy-k8s/README.md) — Deployment pipeline details
- [Smoke Test Scripts](../scripts/smoke-k8s-infra/README.md) — Script-level smoke test documentation

### Architecture and Standards
- [ADR-0002: Standardize Local K8s Deploy Workflow](architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md)
- [Tech Stack](main-diagrams/tech-stack.md) — Technologies and tools
- [Coding Standards](coding-standards/coding-standards.md) — Development standards

