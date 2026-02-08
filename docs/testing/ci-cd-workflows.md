# GitHub Actions CI/CD Workflows

> **Migration Note:** As of February 2026, all CI/CD workflows use unified Python pipelines
> for cross-platform consistency. See [Pipeline Migration Guide](../migration/pipeline-migration.md)
> for command mapping and migration details.

This document provides detailed information about the GitHub Actions CI/CD workflows in this repository.

## Overview

The CI/CD pipeline mirrors the local `test-and-spinup-all` workflow, running the exact same scripts in GitHub Actions to ensure consistency between local development and CI environments.

**Design Principles**:
- **No duplication**: CI calls existing local scripts rather than reimplementing logic
- **Strict ordering**: Jobs run sequentially (test → validate → deploy) matching local pipeline
- **Fail-fast with diagnostics**: Each stage captures extensive logs and diagnostics on failure
- **Artifact preservation**: All logs, reports, and coverage data uploaded for debugging

## Workflows

### Main Workflow: `ci-test-and-spinup-all.yml`

**Location**: [`.github/workflows/ci-test-and-spinup-all.yml`](../.github/workflows/ci-test-and-spinup-all.yml)

#### Triggers

1. **Pull Request** - Runs on all PRs targeting `main`
   ```yaml
   on:
     pull_request:
       branches:
         - main
   ```

2. **Push to main** - Runs on all commits to `main` branch
   ```yaml
   on:
     push:
       branches:
         - main
   ```

3. **Manual Dispatch** - Allows manual triggering with custom parameters
   ```yaml
   on:
     workflow_dispatch:
       inputs:
         kind_cluster_name:
           description: 'kind cluster name (default: cs301-crm)'
           required: false
           default: 'cs301-crm'
         namespace:
           description: 'Kubernetes namespace (default: dev)'
           required: false
           default: 'dev'
   ```

#### Jobs

##### Job 1: `test_all` - Test Backend + Frontend + Coverage

**Purpose**: Run all tests and generate coverage reports

**Execution**:
```bash
python scripts/pipelines/test_all.py
```

**Dependencies**:
- JDK 21 (Temurin distribution)
- Node.js 20.x (with npm caching)
- Python 3.11 (with pip caching)

**Setup Steps**:
1. Checkout repository
2. Setup JDK 21 with Gradle cache
3. Setup Node.js 20 with npm cache (path: `services/frontend/crm-ui/package-lock.json`)
4. Setup Python 3.11 with pip cache (path: `services/backend/log/requirements.txt`)
5. Make all scripts executable (`.sh` files + `gradlew`)
6. Run full test pipeline

**Artifacts** (on failure):
- **Name**: `test-logs-and-coverage-failure`
- **Retention**: 7 days
- **Contents**:
  - `build-logs/**` - All pipeline logs
  - `services/backend/*/build/reports/**` - Gradle test reports
  - `services/backend/log/build/pytest/**` - Python test reports
  - `services/backend/log/build/coverage.xml` - Python coverage
  - `services/frontend/crm-ui/coverage/**` - Frontend coverage

**Artifacts** (on success):
- **Name**: `test-coverage-reports`
- **Retention**: 14 days
- **Contents**:
  - Aggregated coverage index
  - Backend coverage index
  - Individual service coverage reports (JaCoCo HTML)
  - Python coverage XML
  - Frontend coverage reports

**Timeout**: 30 minutes

---

##### Job 2: `k8s_validate` - Validate Kubernetes Manifests

**Purpose**: Validate all K8s manifests offline (no cluster required)

**Depends On**: `test_all` (must succeed first)

**Execution**:
```bash
make k8s-validate
```

**Dependencies**:
- Python 3.11 (for YAML parsing)
- Helm (latest)
- kubectl (latest)
- kubeconform v0.6.7

**Setup Steps**:
1. Checkout repository
2. Setup Python 3.11
3. Install Helm via `azure/setup-helm@v4`
4. Install kubectl via `azure/setup-kubectl@v4`
5. Install kubeconform from GitHub releases
6. Make validation script executable
7. Run validation

**What Gets Validated**:
1. **kind config**: `platform/k8s/infra/kind-config.yaml` - YAML syntax check
2. **Helm charts**: Templates rendered and validated:
   - `ingress-nginx/ingress-nginx`
   - `bitnami/metrics-server`
   - `bitnami/postgresql`
3. **Kustomize overlays**: `platform/k8s/apps/overlays/dev` - rendered and validated

**Artifacts** (on failure):
- **Name**: `k8s-validation-failure`
- **Retention**: 7 days
- **Contents**:
  - `.k8s-validate-tmp/**` - All rendered manifests for debugging

**Timeout**: 10 minutes

---

##### Job 3: `deploy_kind_smoke` - Deploy to kind + Smoke Tests

**Purpose**: Deploy to local kind cluster and run comprehensive smoke tests

**Depends On**: `k8s_validate` (must succeed first)

**Execution**:
```bash
python scripts/pipelines/deploy_k8s.py
```

**Dependencies**:
- JDK 21 (Temurin distribution)
- Node.js 20.x (with npm caching)
- Python 3.11
- Helm (latest)
- kubectl (latest)
- kubeconform v0.6.7
- kind v0.25.0

**Setup Steps**:
1. Checkout repository
2. Setup JDK 21, Node.js 20, Python 3.11
3. Install Helm, kubectl, kubeconform
4. Install kind (via `helm/kind-action@v1` with `install_only: true`)
5. Install frontend dependencies (`npm install` in `services/frontend/crm-ui`)
6. Make all scripts executable
7. Run deployment and smoke tests

**What Happens**:
1. **Validation**: Runs `make k8s-validate`
2. **Cluster Setup**: Creates kind cluster (if not exists) or verifies existing
3. **Infrastructure Deploy**: Deploys ingress-nginx, metrics-server, postgresql
4. **Build Images**: Builds all Docker images (agent, client, log, transaction, crm-ui)
5. **Load Images**: Loads images into kind cluster
6. **Deploy Apps**: Deploys all services via kustomize
7. **Smoke Tests**: 
   - Infrastructure smoke (HTTP endpoints, CRUD operations)
   - Probe-aware smoke (readiness/liveness/startup probes)
8. **Teardown**: Deletes kind cluster (normal behavior)

**On Failure - Automatic Diagnostics**:

The workflow automatically captures extensive kubectl diagnostics if deployment or smoke tests fail:

```bash
# Pods across all namespaces
kubectl get pods -A -o wide

# Services across all namespaces
kubectl get svc -A -o wide

# Ingress resources
kubectl get ingress -A -o wide

# Recent events (last 200)
kubectl get events -A --sort-by=.metadata.creationTimestamp | tail -200

# Pod descriptions in target namespace
kubectl describe pods -n dev

# Container logs for all pods in target namespace
kubectl logs -n dev <pod> --all-containers --tail=200
```

All diagnostics are printed directly in the job logs for immediate visibility.

**Artifacts** (always uploaded):
- **Name**: `k8s-deploy-logs`
- **Retention**: 14 days
- **Contents**:
  - `build-logs/build-and-deploy-k8s/**` - Deployment logs and HTML summary reports
  - Includes comprehensive deployment summary with probe validation results

**Timeout**: 45 minutes

---

## Local vs CI Comparison

| Aspect | Local | CI |
|--------|-------|-----|
| **Environment** | Windows/macOS/Linux | ubuntu-latest |
| **Scripts** | `test-and-spinup-all.sh` | Same script, same execution order |
| **Validation** | `make k8s-validate` | Same make target |
| **Deploy** | `deploy_k8s.py` | Python pipeline (cross-platform) |
| **Cluster Cleanup** | Automatic teardown | Automatic teardown |
| **Dependencies** | Manual install via `setup.sh/ps1` | Installed via GitHub Actions |
| **Logs** | `build-logs/` on local disk | Uploaded as artifacts |
| **Coverage** | Local HTML files | Uploaded as artifacts |

**Key Point**: CI runs your actual scripts, not reimplementations. If it works locally, it should work in CI.

---

## Debugging Failed CI Runs

### Test Failures (`test_all` job)

**Symptoms**:
- Unit tests fail
- Integration tests fail
- Coverage generation fails

**Debugging Steps**:
1. Click on failed `test_all` job
2. Expand the "Run full test pipeline" step
3. Review test output logs
4. Download artifact `test-logs-and-coverage-failure`
5. Extract and open HTML reports locally:
   - `build-logs/build-and-test-all/index.html` - Aggregated view
   - `build-logs/build-and-test-backend/index.html` - Backend summary
   - `services/backend/<service>/build/reports/tests/test/index.html` - Specific service failures
   - `services/frontend/crm-ui/coverage/index.html` - Frontend test results

**Common Issues**:
- **Gradle cache corruption**: Re-run workflow (caches auto-refresh)
- **npm dependency issues**: Check `package-lock.json` is committed
- **Python dependency issues**: Check `requirements.txt` and pip cache

---

### Validation Failures (`k8s_validate` job)

**Symptoms**:
- Helm template rendering fails
- kubeconform validation errors
- YAML syntax errors

**Debugging Steps**:
1. Click on failed `k8s_validate` job
2. Review the "Run K8s manifest validation" step output
3. Download artifact `k8s-validation-failure`
4. Extract `.k8s-validate-tmp/` and review rendered manifests
5. Identify validation errors (look for kubeconform output)

**Common Issues**:
- **API version deprecated**: Update chart versions in validation script
- **Invalid Helm values**: Check `platform/k8s/infra/helm-values/*.yaml`
- **Kustomize overlay errors**: Verify `platform/k8s/apps/overlays/dev/kustomization.yaml`
- **Missing CRDs**: kubeconform needs CRD schemas (validation script includes defaults)

**Local Reproduction**:
```bash
make k8s-validate
```

---

### Deployment Failures (`deploy_kind_smoke` job)

**Symptoms**:
- kind cluster creation fails
- Image build fails
- Deployment rollout timeout
- Smoke tests fail

**Debugging Steps**:

1. **Review Job Logs**:
   - Click on failed `deploy_kind_smoke` job
   - Expand "Run local K8s deployment and smoke tests"
   - Expand "Capture kubectl diagnostics on failure" (auto-runs on failure)

2. **Check Automated Diagnostics** (in job logs):
   - Pod status: Are pods running/pending/crashing?
   - Services: Are services created with correct selectors?
   - Ingress: Is ingress-nginx controller ready?
   - Events: Recent cluster events show resource issues
   - Pod descriptions: Show resource constraints, image pull errors
   - Container logs: Show application startup errors

3. **Download Artifacts**:
   - Download `k8s-deploy-logs` artifact
   - Open `build-logs/build-and-deploy-k8s/*.log` - Full deployment log
   - Open `build-logs/build-and-deploy-k8s/summary-k8s-deploy__*.html` - HTML summary

**Common Issues**:

| Issue | Symptom | Solution |
|-------|---------|----------|
| **ImagePullBackOff** | Pods stuck pulling images | Check Docker build logs, ensure `kind load` succeeded |
| **CrashLoopBackOff** | Pods restarting repeatedly | Check container logs (auto-captured), review app startup |
| **Probe failures** | Pods not becoming ready | Review probe-diagnostics-summary.html, check readiness probe paths |
| **Ingress not ready** | Smoke tests timeout | Check ingress-nginx controller logs, ensure it's running |
| **Database connection** | App logs show DB errors | Check postgresql pod status, verify connection strings |
| **Resource constraints** | Pods pending | Check node resources (kind has limited capacity) |

**Local Reproduction**:
```bash
# Full pipeline
bash scripts/test-and-spinup-all/test-and-spinup-all.sh

# Just deploy (skip tests)
python scripts/pipelines/deploy_k8s.py
```

**Manual Cluster Inspection** (if you want to keep cluster running):

Modify `build-and-deploy-k8s-local.sh` locally to skip teardown:
```bash
# Comment out these lines at the end:
# kubectl delete -k platform/k8s/apps/overlays/dev --ignore-not-found || true
# helm uninstall postgres -n dev || true
# ...
# kind delete cluster --name "${kind_cluster_name}" || true
```

Then inspect manually:
```bash
kubectl config use-context kind-cs301-crm
kubectl get pods -n dev
kubectl logs -n dev <pod-name>
kubectl describe pod -n dev <pod-name>
```

---

## Viewing Coverage Reports from CI

### Download and View Locally

1. Go to successful workflow run
2. Scroll to "Artifacts" section
3. Download `test-coverage-reports.zip`
4. Extract archive
5. Open in browser:
   - `build-logs/build-and-test-all/index.html` - **Aggregated coverage** (recommended)
   - `build-logs/build-and-test-backend/index.html` - Backend only
   - `services/frontend/crm-ui/coverage/index.html` - Frontend only

**Note**: Open directly in browser (`file:///...`), not in VS Code preview.

### Coverage Thresholds

The repository does not enforce minimum coverage thresholds in CI (tests just need to pass). However, coverage reports are always generated for visibility.

To add coverage thresholds locally:
- **Backend (Gradle)**: Configure in `build.gradle` (JaCoCo plugin)
- **Backend (Python)**: Configure in `setup.cfg` or `pyproject.toml` (pytest-cov)
- **Frontend**: Configure in `vitest.config.ts`

---

## Extending the Workflows

### Adding a New Backend Service

If you add a new backend service (e.g., `services/backend/notification`):

1. **No workflow changes needed** - `build-and-test-backend.sh` auto-discovers services
2. Ensure your service has:
   - **Gradle**: `gradlew` + `build.gradle` with test/jacoco tasks
   - **Python**: `run-local-test-pipeline.py` script
3. Add Dockerfile and deployment manifests as usual
4. CI will automatically:
   - Test your service
   - Include it in coverage reports
   - Build and deploy its image

### Adding a New Frontend Service

If you add another frontend service:

1. Update `build-and-test-frontend.sh` to discover multiple services
2. Update `generate-aggregated-coverage-index.py` to include the new service
3. No workflow file changes needed

### Adding Custom Workflow Jobs

To add a new stage (e.g., security scanning):

```yaml
security_scan:
  name: Security Scan
  runs-on: ubuntu-latest
  needs: test_all
  steps:
    - uses: actions/checkout@v4
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
```

Add `needs: security_scan` to `k8s_validate` to enforce ordering.

---

## Environment Variables

### Global Environment Variables

Set in workflow file `env:` section:

| Variable | Default | Description |
|----------|---------|-------------|
| `KIND_CLUSTER_NAME` | `cs301-crm` | Name of kind cluster (from workflow input or default) |
| `NS` | `dev` | Kubernetes namespace for deployment |
| `GRADLE_USER_HOME` | `${{ github.workspace }}/.gradle-user-home` | Gradle cache directory |

### Make Target Variables

The Makefile supports these overrides:

| Variable | Default | Description |
|----------|---------|-------------|
| `KIND_CLUSTER_NAME` | `cs301-crm` | kind cluster name (detected from kind-config.yaml) |
| `NS` | `dev` | Target namespace |
| `KUBECTL` | `kubectl` | kubectl binary path |
| `HELM` | `helm` | Helm binary path |
| `KIND` | `kind` | kind binary path |

Override in workflow if needed:
```yaml
- name: Run K8s validation
  run: make k8s-validate
  env:
    NS: staging
```

---

## Caching Strategy

### Gradle Cache

Managed by `actions/setup-java@v4`:
```yaml
- uses: actions/setup-java@v4
  with:
    java-version: '21'
    distribution: 'temurin'
    cache: 'gradle'
```

**Key**: Based on `**/*.gradle*` and `**/gradle-wrapper.properties`
**Benefit**: Speeds up Gradle dependency resolution

### npm Cache

Managed by `actions/setup-node@v4`:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: services/frontend/crm-ui/package-lock.json
```

**Key**: Based on `package-lock.json`
**Benefit**: Speeds up npm install

### pip Cache

Managed by `actions/setup-python@v5`:
```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.11'
    cache: 'pip'
    cache-dependency-path: services/backend/log/requirements.txt
```

**Key**: Based on `requirements.txt`
**Benefit**: Speeds up Python package installation

### Docker Layer Cache

Currently not implemented. GitHub Actions does not cache Docker layers by default.

**Potential optimization**:
- Use `docker/build-push-action@v5` with `cache-from` and `cache-to`
- Or use kind's image cache across workflows (requires persistence)

---

## Performance Optimization

### Current Timings (Approximate)

| Job | Typical Duration |
|-----|------------------|
| `test_all` | 5-8 minutes |
| `k8s_validate` | 1-2 minutes |
| `deploy_kind_smoke` | 10-15 minutes |
| **Total** | **16-25 minutes** |

### Optimization Strategies

1. **Parallelize Independent Tests**:
   - Currently all tests run in one job
   - Could split into separate jobs: `test_backend`, `test_frontend`
   - Trade-off: More parallel execution vs. more setup overhead

2. **Docker Build Cache**:
   - Implement layer caching (see above)
   - Potential savings: 2-3 minutes

3. **Selective Execution**:
   - Use path filters to run only affected jobs:
     ```yaml
     on:
       pull_request:
         paths:
           - 'services/backend/**'
           - '.github/workflows/ci-test-and-spinup-all.yml'
     ```
   - Trade-off: Faster CI vs. less comprehensive validation

4. **Artifact Optimization**:
   - Currently uploads all coverage on success
   - Could reduce retention or upload only on PR (not push to main)

---

## Troubleshooting Common Errors

### Error: "No space left on device"

**Cause**: Docker images fill up runner disk space

**Solution**:
```yaml
- name: Free up disk space
  run: |
    docker system prune -af
    df -h
```

Add this step before Docker builds in `deploy_kind_smoke` job.

---

### Error: "Context deadline exceeded" (kubectl/kind)

**Cause**: Timeouts waiting for resources

**Solutions**:
1. Increase timeout in Makefile:
   ```makefile
   kubectl wait ... --timeout=300s  # Increase from 180s
   ```
2. Check resource constraints (kind has limited capacity)
3. Review pod startup time (heavy Spring Boot apps can be slow)

---

### Error: "Gradle daemon disappeared unexpectedly"

**Cause**: Out of memory or Gradle daemon crash

**Solution**: Add Gradle configuration to workflow:
```yaml
- name: Run tests
  run: python scripts/pipelines/test_all.py
  env:
    GRADLE_OPTS: '-Dorg.gradle.daemon=false -Xmx2g'
```

---

## Automated Testing Scripts

### Complete CI/CD Testing Workflow

For comprehensive validation of the entire CI/CD pipeline, use the orchestration script that ties together all testing phases:

**Script**: [`scripts/test-ci-cd-full/test-ci-cd-full.ps1`](../../scripts/test-ci-cd-full/test-ci-cd-full.ps1)

**Quick Start**:
```powershell
# Run full validation (local + GitHub Actions, no PRs)
.\scripts\test-ci-cd-full.cmd

# Run all phases including E2E workflow with PR creation
.\scripts\test-ci-cd-full.cmd -CreatePRs -EndToEnd

# Only verify dependencies
.\scripts\test-ci-cd-full.cmd -VerifyOnly

# Only run local validation
.\scripts\test-ci-cd-full.cmd -LocalOnly
```

**What It Does**:

1. **Phase 1: Local Validation** (optional, skipped with `-GitHubOnly`)
   - Validates GitHub workflow syntax using actionlint
   - Runs complete local test pipeline (`test-and-spinup-all.ps1`)
   - Catches issues before pushing to GitHub

2. **Phase 2: GitHub Actions Testing** (optional, skipped with `-LocalOnly`)
   - Creates test commits on component trunk branches
   - Monitors workflow runs and collects results
   - Validates branch policy rules (if `-CreatePRs` specified)

3. **Phase 3: End-to-End Workflow** (optional, enabled with `-EndToEnd`)
   - Creates feature branch and test PR
   - Verifies branch policy enforcement
   - Tests merge cascade workflow
   - Cleans up test PR and branch

**Output**:
- Detailed log: `build-logs/test-ci-cd-full/inv{timestamp}__test-ci-cd-full.log`
- HTML report: `build-logs/test-ci-cd-full/complete-test-report.html`

**Exit Codes**:
- `0`: All phases passed
- `1-2`: Phase 1 (local validation) failed
- `3-6`: Phase 2 (GitHub Actions) failed
- `7`: Phase 3 (E2E workflow) failed
- `8`: Timeout or fatal error
- `9`: Dependency verification failed

**Documentation**: [scripts/test-ci-cd-full/README.md](../../scripts/test-ci-cd-full/README.md)

### Phase 1: Local Validation

Test workflows locally before pushing to GitHub.

**Script**: [`scripts/test-ci-cd-local/test-ci-cd-local.ps1`](../../scripts/test-ci-cd-local/test-ci-cd-local.ps1)

**Quick Start**:
```powershell
# Run full local validation
.\scripts\test-ci-cd-local.cmd

# Only validate workflow syntax
.\scripts\test-ci-cd-local.cmd -SkipTests

# Only run local test pipeline
.\scripts\test-ci-cd-local.cmd -SkipActionlint

# Keep cluster running after tests
.\scripts\test-ci-cd-local.cmd -Keep
```

**What It Does**:
1. Validates GitHub workflow YAML syntax using actionlint
2. Runs the full local test pipeline (`test-and-spinup-all.ps1`)
3. Generates validation report

**Documentation**: [scripts/test-ci-cd-local/README.md](../../scripts/test-ci-cd-local/README.md)

### Phase 2: GitHub Actions Testing

Test GitHub Actions workflows by pushing test commits.

**Script**: [`scripts/test-ci-cd-github/test-ci-cd-github.ps1`](../../scripts/test-ci-cd-github/test-ci-cd-github.ps1)

**Quick Start**:
```powershell
# Test workflows (dry-run, no PRs)
.\scripts\test-ci-cd-github.cmd -WaitForWorkflows

# Test with PR creation and branch policy validation
.\scripts\test-ci-cd-github.cmd -CreatePRs -WaitForWorkflows

# Only verify gh CLI is authenticated
.\scripts\test-ci-cd-github.cmd -VerifyOnly
```

**What It Does**:
1. Creates test commits on component trunk branches
2. Pushes commits to trigger workflows
3. Monitors workflow runs and collects results
4. Optionally creates test PRs to validate branch policy
5. Generates JSON report of workflow results

**Safety**: Runs in dry-run mode by default. Use `-CreatePRs` to actually create PRs.

**Documentation**: [scripts/test-ci-cd-github/README.md](../../scripts/test-ci-cd-github/README.md)

### Recommended Testing Workflow

```powershell
# 1. Pre-push: Run local validation
.\scripts\test-ci-cd-local.cmd
# Exit code 0? Safe to push

# 2. Post-push: Monitor GitHub Actions (automated via CI)
# Workflows run automatically on push/PR

# 3. Periodic: Full CI/CD health check
.\scripts\test-ci-cd-full.cmd
# Review HTML report in build-logs/test-ci-cd-full/

# 4. Pre-release: Complete validation with PRs
.\scripts\test-ci-cd-full.cmd -CreatePRs -EndToEnd
# Exit code 0? Ready to release
```

---

## Best Practices

### Local-First Development

Always test locally before pushing:
```bash
# Full pipeline
bash scripts/test-and-spinup-all/test-and-spinup-all.sh

# Just tests
python scripts/pipelines/test_all.py

# Just validation
make k8s-validate
```

If it works locally, it should work in CI.

### Commit Often, Push After Validation

1. Make changes
2. Run local tests: `python scripts/pipelines/test_all.py`
3. Commit changes
4. Run local validation: `make k8s-validate`
5. Push to remote
6. CI validates in same way

### Use Manual Dispatch for Experiments

When testing CI changes:
1. Push to feature branch
2. Use "workflow_dispatch" to trigger manually
3. Override parameters if testing different configurations
4. Review artifacts and logs
5. Iterate until stable

### Review Artifacts Before Merging

On PRs:
1. Wait for all jobs to complete
2. Download `test-coverage-reports` artifact
3. Review coverage HTML reports
4. Ensure coverage hasn't dropped significantly
5. Approve and merge

---

## Branch Strategy & Guardrails

The repo uses soft-enforced branch policies (since GitHub Classroom does not allow branch protection rules):

- **Branch policy CI check**: `.github/workflows/branch-policy.yml` — fails PRs that violate merge direction rules
- **CODEOWNERS**: `.github/CODEOWNERS` — auto-requests reviews from owning teams
- **PR template**: `.github/pull_request_template.md` — checklist for every PR
- **Local git hooks**: `.githooks/pre-push` — blocks direct pushes to `main`/`integration`

Setup the local hooks (one-time per clone):
```bash
git config core.hooksPath .githooks
```

Full details: **[docs/ci/branch-strategy.md](ci/branch-strategy.md)**

---

## Related Documentation

- **[README.md](../README.md)** - Main repository documentation
- **[docs/ci/branch-strategy.md](ci/branch-strategy.md)** - Branch strategy and guardrails
- **[docs/ci/architecture.md](ci/architecture.md)** - CI architecture (reusable workflows, job DAG)
- **[docs/testing/backend-local-pipeline.md](testing/backend-local-pipeline.md)** - Backend testing details
- **[docs/testing/frontend-local-pipeline.md](testing/frontend-local-pipeline.md)** - Frontend testing details
- **[docs/testing/k8s-validation.md](testing/k8s-validation.md)** - K8s validation deep-dive
- **[docs/testing/smoke/README.md](testing/smoke/README.md)** - Smoke testing comprehensive guide
- **[docs/local-k8s-dev.md](local-k8s-dev.md)** - Local K8s development guide

---

## Questions or Issues?

If you encounter CI issues:
1. Review this guide and related docs
2. Check existing GitHub Issues
3. Review workflow run logs and artifacts
4. Reproduce locally using same scripts
5. Open a new issue with diagnostics if needed
