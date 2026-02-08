# CI/CD Debugging Guide

This guide helps you debug CI failures both locally and in GitHub Actions.

## Table of Contents
- [Quick Triage](#quick-triage)
- [Debugging Locally](#debugging-locally)
- [Debugging in GitHub Actions](#debugging-in-github-actions)
- [Common Failure Patterns](#common-failure-patterns)
- [CI Hardening Features](#ci-hardening-features)

---

## Quick Triage

### 1. Identify the Failed Stage

CI pipelines are organized into layers that fail fast:

```
changes (5s) → lint (3-5m) → tests (8-12m) → k8s-validate (5m) → kind-smoke (35m)
```

**Timeouts by stage:**
- **Lint/Typecheck**: 3-5 minutes (short, fail-fast)
- **Unit Tests**: 8-12 minutes (moderate)
- **K8s Validation**: 5 minutes (static analysis)
- **Kind Deploy + Smoke**: 35 minutes (realistic but bounded)

### 2. Check the Summary

Every CI run produces:
- **GitHub Actions Summary**: Auto-generated markdown summary with key metrics
- **K8s Deploy Summary** (on kind-smoke failure): HTML report uploaded as artifact

### 3. Download Artifacts (if failed)

On failure, check these artifacts:
- `k8s-deploy-logs-failure/`: Full deployment logs (large, only on failure)
- `k8s-deploy-summary/`: Tiny HTML summary (always available)
- `test-reports-*/`: Test reports and coverage (only on test failure)
- `k8s-validation-failure/`: Rendered manifests (only on validation failure)

---

## Debugging Locally

### Prerequisites

Ensure you have:
- Docker Desktop running
- `kind`, `kubectl`, `helm`, `make`, `bash` in PATH
- Java 21, Node 20, Python 3.11+ installed

### Run the Full Pipeline Locally

```bash
# Windows (PowerShell)
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1 -Deploy

# Linux/macOS
bash scripts/test-and-spinup-all/test-and-spinup-all.sh
```

### Run Individual Stages

```bash
# 1. Validate K8s manifests only (fast, no cluster needed)
make k8s-validate

# 2. Lint only
# Java
cd services/backend/agent && ./gradlew checkstyleMain checkstyleTest
# Python
cd services/backend/log && python -m black --check app tests && python -m flake8 app tests
# Frontend
cd services/frontend/crm-ui && npm run lint && npm run typecheck && npm run format:check

# 3. Run tests for a single component
cd services/backend/agent && ./gradlew test
cd services/backend/log && python -m pytest tests
cd services/frontend/crm-ui && npm run test:coverage

# 4. Deploy to kind only (no teardown)
bash scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh

# 5. Keep cluster on failure for debugging
KEEP_CLUSTER=1 bash scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

### Debugging a Failed Kind Deployment

If kind deploy fails and you used `KEEP_CLUSTER=1`, the cluster is preserved for inspection:

```bash
# Check pod status
kubectl get pods -n dev -o wide

# Check recent events (most useful for diagnosing failures)
kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -200

# Describe a failing pod
kubectl describe pod <pod-name> -n dev

# Check logs
kubectl logs <pod-name> -n dev --all-containers --tail=200

# Check services and ingress
kubectl get svc,ingress -n dev

# Check deployments and replicasets
kubectl get deployments,replicasets -n dev -o wide

# List helm releases
helm list -n dev
```

**Iterate on fixes without recreating cluster:**

```bash
# 1. Fix code/manifests
# 2. Rebuild images
make build-images && make kind-load

# 3. Redeploy
make deploy-dev

# 4. Rerun smoke tests
make smoke

# 5. Cleanup when done
kind delete cluster --name cs301-crm
```

---

## Debugging in GitHub Actions

### View Diagnostics

When a kind-smoke job fails, the [k8s-debug action](.github/actions/k8s-debug/action.yml) automatically captures:

1. **Pods across all namespaces** (`kubectl get pods -A -o wide`)
2. **Services and Ingress** (`kubectl get svc,ingress -A -o wide`)
3. **Deployments, ReplicaSets, StatefulSets** in target namespace
4. **Recent events** (last 200, sorted by timestamp)
5. **Pod descriptions** (`kubectl describe pods -n dev`)
6. **Container logs** (`kubectl logs --all-containers --tail=200`)
7. **Node status and resource usage** (`kubectl top nodes`, `kubectl top pods`)
8. **Helm releases** (`helm list -A`)
9. **PersistentVolumeClaims** (`kubectl get pvc -n dev`)

All diagnostics are printed to the workflow log. Scroll to the "Capture K8s diagnostics on failure" step.

### Download Artifacts

1. Go to the failed workflow run
2. Scroll to bottom → "Artifacts" section
3. Download:
   - `k8s-deploy-logs-failure`: Full logs from build-and-deploy script
   - `k8s-deploy-summary`: HTML report with timeline and metrics
   - `test-reports-*`: Test results and coverage (if tests failed)

### Re-run with Debugging

You can manually trigger workflows with custom parameters:

1. Go to **Actions** → Select workflow (e.g., `CI - Integration Pipeline`)
2. Click **Run workflow**
3. Options:
   - `kind_cluster_name`: Default `cs301-crm`
   - `namespace`: Default `dev`
4. Click **Run workflow**

---

## Common Failure Patterns

### 1. Lint Failures

**Symptom:** ESLint, Prettier, Checkstyle, Black, or Flake8 errors

**Local debug:**
```bash
# Frontend
cd services/frontend/crm-ui
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # TypeScript

# Java backend
cd services/backend/agent
./gradlew checkstyleMain checkstyleTest

# Python backend
cd services/backend/log
python -m black --check app tests
python -m flake8 app tests
```

**Fix:** Address linting errors shown in logs. Auto-fix where possible:
```bash
npm run format        # Prettier auto-fix
python -m black app tests  # Black auto-fix
```

---

### 2. Unit Test Failures

**Symptom:** Test job fails with test errors

**Local debug:**
```bash
# Run tests with verbose output
cd services/backend/agent && ./gradlew test --info
cd services/backend/log && python -m pytest tests -v
cd services/frontend/crm-ui && npm run test
```

**CI artifacts:** Download `test-reports-<component>/` artifact for detailed reports.

---

### 3. K8s Manifest Validation Failures

**Symptom:** `k8s-validate` job fails

**Local debug:**
```bash
make k8s-validate
```

**CI artifacts:** Download `k8s-validation-failure/` to see rendered manifests.

**Common causes:**
- Invalid Kubernetes resource syntax
- Missing required fields (e.g., `apiVersion`, `kind`)
- Invalid Helm chart values
- Kustomize overlay errors

---

### 4. Kind Cluster Creation Failures

**Symptom:** "Kind cluster creation failed after 3 attempts"

**Causes:**
- Docker daemon not running
- Insufficient Docker resources (CPU/memory)
- Transient network issues (retries handle most cases)

**CI hardening:** Kind create automatically retries up to 3 times with 5s delays.

**Local debug:**
```bash
# Check Docker
docker info

# Manually create cluster
kind create cluster --name cs301-crm --config platform/k8s/infra/kind-config.yaml
```

---

### 5. Deployment Timeout / Pods Not Ready

**Symptom:** `kubectl wait` times out waiting for pods to be ready

**Diagnostics to check (auto-captured on failure):**

1. **Events** (most important!):
   ```bash
   kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -200
   ```
   Look for: `ImagePullBackOff`, `CrashLoopBackOff`, `FailedScheduling`

2. **Pod status**:
   ```bash
   kubectl get pods -n dev -o wide
   ```

3. **Describe failing pod**:
   ```bash
   kubectl describe pod <pod-name> -n dev
   ```
   Check: `Events`, `Conditions`, `Status`

4. **Container logs**:
   ```bash
   kubectl logs <pod-name> -n dev --all-containers --tail=200
   ```

**Common causes:**
- **ImagePullBackOff**: Image not loaded into kind (`make kind-load`)
- **CrashLoopBackOff**: Application crash on startup (check logs)
- **Pending**: Insufficient resources or missing PVC
- **Init:Error**: Init container failed (check init container logs)

---

### 6. Smoke Test Failures

**Symptom:** Pods are ready but smoke tests fail

**Local debug:**
```bash
# Rerun smoke tests
make smoke-infra
make smoke-probes

# Or full smoke suite
make smoke
```

**Check:**
1. Service DNS resolution (`kubectl get svc -n dev`)
2. Ingress configuration (`kubectl get ingress -n dev`)
3. Health/readiness probe endpoints
4. Database connectivity (Postgres pod ready?)

**Logs:**
```bash
# Check application logs for errors
kubectl logs -n dev -l app=agent-backend --tail=100
kubectl logs -n dev -l app=client-backend --tail=100
kubectl logs -n dev -l app=transaction-backend --tail=100
```

---

## CI Hardening Features

### Strict Timeouts

All jobs and critical steps have bounded timeouts to fail fast:

| Stage | Job Timeout | Step Timeout |
|-------|-------------|--------------|
| Lint (Java) | 5m | 3m (checkstyle) |
| Lint (Python) | 3m | 1m (black/flake8) |
| Lint (Frontend) | 5m | 2m (typecheck/lint) |
| Unit Tests | 8-12m | Matches job |
| K8s Validate | 5m | 3m (validation) |
| Kind Smoke | 35m | 35m (deploy script) |

### Automatic Retries

Flaky infrastructure operations retry automatically:

- **kind create cluster**: 3 attempts, 5s delay
- **helm repo update**: 3 attempts, 3s delay
- **kubectl rollout wait**: Bounded at 180s per resource

Retries are documented in Makefile comments and only applied to infrastructure, never to tests.

### Fail-Fast Diagnostics

On k8s deployment failure, diagnostics are automatically captured (see [k8s-debug action](.github/actions/k8s-debug/action.yml)):

- All resources across namespaces
- Events sorted by timestamp
- Pod descriptions and logs
- Node and resource metrics
- Helm release status

### Artifact Strategy

- **Large artifacts** (logs, test reports): Uploaded only on failure
- **Tiny summaries** (HTML reports): Uploaded always (cheap, useful)
- **Retention**: 7-14 days depending on artifact type

### Actionlint

Validates GitHub Actions workflows for YAML mistakes, invalid action references, and common errors.

**Run locally:**
```bash
# Install actionlint
brew install actionlint  # macOS
# OR
bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)

# Run validation
actionlint -color
```

**CI:** Runs automatically on integration pipeline (fast, fails early).

---

## Need Help?

1. **Check workflow logs** in GitHub Actions
2. **Download artifacts** for detailed reports
3. **Reproduce locally** using the commands in this guide
4. **Check k8s diagnostics** auto-captured on failure
5. **Inspect cluster state** if using `KEEP_CLUSTER=1`

For questions or issues, open a GitHub issue or contact the team.
