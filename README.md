[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA CRM Repository

# **Notes to the team:** 
Before development work, please read through (open all markdown files using `'Open in Preview'` for better UI):
1. **[The Tech Stack](docs/main-diagrams/tech-stack.md)** and configure your laptops/machines to be able to run all those technologies
2. **[API Contracts](docs/api-contracts/openapi)** for your relevant service API.
3. **[The Coding Standards](docs/coding-standards/coding-standards.md)** during dev work and before creating branches, pushing to remote (github), or creating PRs.
4. Open `Docker Desktop` before running any pipelines involving k8s (since we are using `kind`(K8s IN Docker aka KIND)).

**Notes:**
> Local development is fully supported on `kind` without AWS dependencies. AWS-oriented docs can still coexist for target-state planning.


---

## 🚀 New Developer? Start Here!

**First time setting up this project?** We've got you covered with a one-command bootstrap!

### Windows (PowerShell)
```powershell
.\scripts\dev-setup\setup.ps1
```

### macOS / Linux (Bash)
```bash
bash scripts/dev-setup/setup.sh
```

**What it does:**
- ✅ Detects and installs missing tools (Docker, Java, Node, kubectl, helm, kind, etc.)
- ✅ Configures dependencies (npm, Gradle, Python)
- ✅ Runs full verification (k8s validation, backend tests, frontend tests)
- ✅ Provides clear diagnostics and next steps

**Want to check your environment first?**
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 --doctor

# macOS/Linux
bash scripts/dev-setup/setup.sh --doctor
```

**📖 Full Guide**: [docs/onboarding/new-dev-setup.md](docs/onboarding/new-dev-setup.md)

---

## Table of Contents
### Local Pipeline Commands
- [Running All Services for Build/Test](#running-all-services-for-buildtest) - Test backend + frontend, generate coverage reports
- [Running Test & Spinup All for k8s](#running-test--spinup-all-for-k8s) - Test all services then deploy to Kubernetes
- [Running Just k8s Deployment Tests (via kind)](#running-just-k8s-deployment-tests-via-kind) - Deploy only (no testing)

### CI/CD
- [GitHub Actions Workflows](#github-actions-cicd-workflows) - Automated CI/CD pipeline mirroring local test-and-spinup-all

### Partitioned Build/Tests
- [Running Just the Backend Services](#running-just-the-backend-services) - Backend services only
- [Running Just the Frontend Services](#running-just-the-frontend-services) - Frontend service only
- [Running Individual Per-Service Pipelines](#running-individual-per-service-pipelines-for-any-given-backend-service) - Single service testing
- [K8s Manifest Validation (Preflight)](#k8s-manifest-validation-preflight) - Validate Helm + Kustomize manifests offline

### Pipeline Timings
- Backend Pipeline: ~ 2min
- Frontend Pipeline: ~ 2min
- Deploy Pipeline: ~ 5min
- Spinup-All Pipeline: ~ 10min

---

## Documentation

### Getting Started
- **[New Developer Setup](docs/onboarding/new-dev-setup.md)** - One-command environment setup for new team members

### Core Guides
- **[Local Kubernetes Development](docs/local-k8s-dev.md)** - Complete guide for local K8s setup, deployment, and troubleshooting
- **[Tech Stack](docs/main-diagrams/tech-stack.md)** - Technologies and tools used in the project
- **[Coding Standards](docs/coding-standards/coding-standards.md)** - Development standards and best practices
- **[API Contracts](docs/api-contracts/openapi)** - OpenAPI specifications for all services

### Testing & Validation
- **[CI/CD Workflows](docs/ci-cd-workflows.md)** - Comprehensive GitHub Actions CI/CD pipeline documentation
- **[Smoke Testing Guide](docs/testing/smoke/README.md)** - Comprehensive guide to infrastructure and probe-aware smoke tests
- **[K8s Manifest Validation](docs/testing/k8s-validation.md)** - Offline validation of Helm charts and Kustomize overlays
- **[Backend Testing Pipeline](docs/testing/backend-local-pipeline.md)** - Backend test pipeline design and coverage reports
- **[Frontend Testing Pipeline](docs/testing/frontend-local-pipeline.md)** - Frontend test pipeline design and coverage reports

### Scripts & Pipelines
- **[Build and Deploy K8s Scripts](scripts/build-and-deploy-k8s/README.md)** - Automated deployment pipeline documentation
- **[Smoke Test Scripts](scripts/smoke-k8s-infra/README.md)** - Detailed smoke test script documentation

### Architecture
- **[Architectural Decision Records](docs/architectural-decisions-record/README.md)** - Key architectural decisions and rationale
- **[Features Documentation](docs/features/features.md)** - Feature specifications and requirements

---

# Local Pipeline Commands (repo root)
For build logs after script runs refer to `/build-logs`.

Remember to commit each git log wherever and whenever relevant after making code changes. The script automatically enforces that only 3 logs can be inside of any given /build-log sub-directory. 

## Running All Services for Build/Test
Test all services (backend + frontend) and generate comprehensive coverage reports:

```powershell
.\scripts\build-and-test-all\build-and-test-all.ps1
```
```cmd
.\scripts\build-and-test-all.cmd
```
```bash
bash ./scripts/build-and-test-all/build-and-test-all.sh
```

What this does:
- Runs backend pipeline for all backend services (Gradle Java + Python)
- Runs frontend pipeline for the crm-ui service (React/TypeScript)
- Generates individual coverage reports for each service
- Creates an aggregated coverage report combining all services

Outputs:
- Full terminal output is captured to `build-logs/build-and-test-all/*.log` (newest-first naming).
- **Aggregated coverage report**: `build-logs/build-and-test-all/index.html` - unified view of all services
- **Backend coverage report**: `build-logs/build-and-test-backend/index.html` - backend services only
- **Frontend coverage report**: `services/frontend/crm-ui/coverage/index.html` - frontend service only
- Open the HTML reports directly in a normal browser window (`file:///...`); do not use VS Code **Open Preview**.

Notes:
- This script runs all tests but does **not** deploy to Kubernetes
- For full test + deploy workflow, see "Running Test & Spinup All for k8s" below

## Running Test & Spinup All for k8s 
Test all services (backend + frontend) and deploy to local Kubernetes:

```powershell
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1
```
```cmd
.\scripts\test-and-spinup-all.cmd
```
```bash
bash ./scripts/test-and-spinup-all/test-and-spinup-all.sh
```

Notes:
- Runs the full test pipeline (backend + frontend) first. If tests fail, deployment is skipped.
- Logs are captured under `build-logs/build-and-test-all`, `build-logs/build-and-deploy-k8s`, and `build-logs/test-and-spinup-all`.

## Running Just k8s Deployment Tests (via kind)
```powershell
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```
```cmd
.\scripts\build-and-deploy-k8s-local.cmd
```
```bash
bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

Outputs:
- Full terminal output is captured to `build-logs/build-and-deploy-k8s/*.log` (newest-first naming).
- On success, the script tears down the dev workloads and deletes the kind cluster (use the manual steps in `docs/local-k8s-dev.md` if you want to keep the cluster running).

For full setup, verification, troubleshooting, and teardown, use `docs/local-k8s-dev.md`.

## Running Paritioned Build/Tests
### Running Just the Backend Services
```powershell
.\scripts\build-and-test-backend\build-and-test-backend.ps1
```
```cmd
.\scripts\build-and-test-backend.cmd
```
```bash
bash ./scripts/build-and-test-backend/build-and-test-backend.sh
```

Outputs:
- Full terminal output is captured to `build-logs/build-and-test-backend/*.log` (newest-first naming).
- An aggregated backend coverage summary is generated at `build-logs/build-and-test-backend/index.html` (links to per-service JaCoCo/coverage reports).
- Open `build-logs/build-and-test-backend/index.html` directly in a normal browser window (`file:///...`); do not use VS Code **Open Preview** for this report.
- Full pipeline design and report guide: `docs/testing/backend-local-pipeline.md`

### Running Just the Frontend Services
```powershell
.\scripts\build-and-test-frontend\build-and-test-frontend.ps1
```
```cmd
.\scripts\build-and-test-frontend.cmd
```
```bash
bash ./scripts/build-and-test-frontend/build-and-test-frontend.sh
```

Outputs:
- Full terminal output is captured to `build-logs/build-and-test-frontend/*.log` (newest-first naming).
- Test coverage report is generated at `services/frontend/crm-ui/coverage/index.html`.
- Open `services/frontend/crm-ui/coverage/index.html` directly in a normal browser window (`file:///...`).
- Full pipeline design and report guide: `docs/testing/frontend-local-pipeline.md`

For manual testing of frontend UI, use the following credentials for a given agent's account: 
- Username: `admin@example.com`
- Password: `password123`

**Recommended for Frontend Development:**
Install [React DevTools](https://react.dev/learn/react-developer-tools) browser extension for Chrome/Firefox/Edge for a significantly better development experience. This extension provides:
- Component tree inspection with props and state
- Hooks debugging and performance profiling
- Real-time component updates tracking

Note: E2E tests run against production builds and don't require React DevTools.

### Running Individual Per-Service Pipelines for any given Backend Service (Run from each service root)
- `services/backend/agent`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/client`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/transaction`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/log`: `python run-local-test-pipeline.py` (Windows) or `python3 run-local-test-pipeline.py` (macOS/Linux)

### K8s Manifest Validation (Preflight)
Validate all Kubernetes manifests **offline** (no cluster required) before building or deploying:

```bash
make k8s-validate
```

What this checks:
- **kind config** — YAML syntax validation (requires python)
- **Helm charts** — Renders `ingress-nginx`, `metrics-server`, and `postgresql` templates via `helm template`, then validates each with `kubeconform`
- **Kustomize overlay** — Renders `platform/k8s/apps/overlays/dev` via `kubectl kustomize`, then validates with `kubeconform`

This step runs automatically at the start of the k8s deploy scripts (`build-and-deploy-k8s-local.sh` / `.ps1`). If validation fails, the deploy is aborted.

Required tools: `helm`, `kubectl`, `kubeconform`

Installing kubeconform:
```bash
# macOS
brew install kubeconform

# Linux
go install github.com/yannh/kubeconform/cmd/kubeconform@latest

# Windows (scoop)
scoop install kubeconform
```

---

## GitHub Actions CI/CD Workflows

The repository includes a comprehensive CI/CD pipeline that mirrors the local `test-and-spinup-all` workflow in GitHub Actions.

### Main CI Workflow: Test and Spin-Up All

**Workflow File**: [`.github/workflows/ci-test-and-spinup-all.yml`](.github/workflows/ci-test-and-spinup-all.yml)

**Triggers**:
- Pull requests to `main`
- Pushes to `main`
- Manual dispatch with optional parameters (cluster name, namespace)

**Pipeline Stages** (runs in strict order matching local pipeline):

1. **Job 1: Test All** (`test_all`)
   - Runs the exact same script as local: `scripts/build-and-test-all/build-and-test-all.sh`
   - Tests all backend services (Gradle + Python)
   - Tests frontend service (React/TypeScript)
   - Generates aggregated coverage report
   - **Artifacts**: Coverage reports and test logs (uploaded on both success and failure)
   - **Dependencies**: JDK 21, Node.js 20, Python 3.11

2. **Job 2: K8s Validate** (`k8s_validate`)
   - Depends on: `test_all` completion
   - Runs: `make k8s-validate`
   - Validates Helm charts and Kustomize manifests offline
   - **Artifacts**: Rendered manifests (uploaded on failure for debugging)
   - **Dependencies**: Helm, kubectl, kubeconform

3. **Job 3: Deploy to kind & Smoke Tests** (`deploy_kind_smoke`)
   - Depends on: `k8s_validate` completion
   - Runs the exact same script as local: `scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh`
   - Creates kind cluster, deploys infrastructure and apps
   - Runs comprehensive smoke tests (ingress + probes)
   - **On failure**: Captures extensive kubectl diagnostics (pods, services, ingress, events, logs)
   - **Artifacts**: Build logs and deployment reports (always uploaded)
   - **Dependencies**: JDK 21, Node.js 20, Python 3.11, Docker, kind, Helm, kubectl, kubeconform

### Local vs CI Mapping

| Local Command | CI Job | Notes |
|---------------|--------|-------|
| `bash scripts/build-and-test-all/build-and-test-all.sh` | `test_all` | Exact same script |
| `make k8s-validate` | `k8s_validate` | Exact same make target |
| `bash scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh` | `deploy_kind_smoke` | Exact same script |

### Running Workflows Manually

To trigger a workflow manually with custom parameters:

1. Go to [Actions tab](../../actions/workflows/ci-test-and-spinup-all.yml)
2. Click "Run workflow"
3. Optionally override:
   - `kind_cluster_name` (default: `cs301-crm`)
   - `namespace` (default: `dev`)

### Viewing CI Results

**Test Coverage Reports**:
- Download artifact `test-coverage-reports` from successful runs
- Open `build-logs/build-and-test-all/index.html` in browser

**Debugging Failed CI Runs**:

If `test_all` fails:
- Download artifact `test-logs-and-coverage-failure`
- Review test logs and coverage reports

If `k8s_validate` fails:
- Download artifact `k8s-validation-failure`
- Review rendered manifests in `.k8s-validate-tmp/`

If `deploy_kind_smoke` fails:
- Review job logs for kubectl diagnostics (automatically captured):
  - Pod status across all namespaces
  - Services and ingress resources
  - Recent cluster events (last 200)
  - Pod descriptions and container logs
- Download artifact `k8s-deploy-logs`
- Review `build-logs/build-and-deploy-k8s/*.log` and HTML summary reports

### CI vs Local Differences

The CI workflow runs on `ubuntu-latest` and uses the exact same scripts as local development. Key points:

- **No mocking or duplication**: CI calls your local scripts directly
- **Same validation rules**: Helm, kubeconform, smoke tests run identically
- **Same dependencies**: JDK 21, Node 20, Python 3.11 match local requirements
- **Automatic cleanup**: kind cluster is torn down after smoke tests (normal behavior)
- **Artifacts preserved**: All logs and reports are uploaded for debugging

---

## Smoke Testing

The local deploy pipeline runs comprehensive smoke tests automatically after deployment. Smoke tests validate both infrastructure and application health.

### Running All Smoke Tests
```bash
make smoke
```

This runs two test suites in sequence:
1. **Infrastructure smoke** (`smoke-infra`) — validates HTTP endpoints through ingress, CRUD operations, and service integration
2. **Probe-aware smoke** (`smoke-probes`) — validates Kubernetes health probes and pod readiness

### Running Individual Smoke Test Suites

**Infrastructure smoke only** (HTTP endpoints, CRUD, integration):
```bash
make smoke-infra
```

**Probe-aware smoke only** (health probes, rollout status):
```bash
make smoke-probes
```

You can override the namespace for probe-aware smoke (defaults to `dev`):
```bash
make smoke-probes NS=staging
```

### What Probe-Aware Smoke Validates

The probe-aware smoke test (`scripts/smoke-k8s-infra/smoke-probes.sh` / `.ps1`) ensures:

1. **Rollout readiness** — All Deployments and StatefulSets in the namespace must reach ready state before HTTP checks
2. **Probe presence** — Every container must have:
   - `readinessProbe` (required)
   - `livenessProbe` (required)
   - `startupProbe` (required for workloads listed in `scripts/smoke-k8s-infra/startup-probe-required.txt`)
3. **In-cluster health checks** — Spawns an ephemeral curl pod to validate HTTP probe endpoints from inside the cluster

On failure, the script dumps diagnostic information:
- Pod status and details
- Recent cluster events
- Container logs
- **HTML diagnostics report**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
- **JSON failure report**: `build-logs/build-and-deploy-k8s/probe-failures.json` (for CI/CD)

For detailed smoke testing documentation, see [docs/testing/smoke/README.md](docs/testing/smoke/README.md).