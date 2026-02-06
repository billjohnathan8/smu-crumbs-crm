[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA CRM Repository

# **Notes to the team:** 
Before development work, please read through (open all markdown files using `'Open in Preview'` for better UI):
1. **[The Tech Stack](docs/main-diagrams/tech-stack.md)** and configure your laptops/machines to be able to run all those technologies
2. **[API Contracts](docs/api-contracts/openapi)** for your relevant service API.
3. **[The Coding Standards](docs/coding-standards/coding-standards.md)** during dev work and before creating branches, pushing to remote (github), or creating PRs.

**Notes:**
> Local development is fully supported on kind without AWS dependencies. AWS-oriented docs can still coexist for target-state planning.

---

## Table of Contents

### Local Pipeline Commands
- [Running All Services for Build/Test](#running-all-services-for-buildtest) - Test backend + frontend, generate coverage reports
- [Running Test & Spinup All for k8s](#running-test--spinup-all-for-k8s) - Test all services then deploy to Kubernetes
- [Running Just k8s Deployment Tests (via kind)](#running-just-k8s-deployment-tests-via-kind) - Deploy only (no testing)

### Partitioned Build/Tests
- [Running Just the Backend Services](#running-just-the-backend-services) - Backend services only
- [Running Just the Frontend Services](#running-just-the-frontend-services) - Frontend service only
- [Running Individual Per-Service Pipelines](#running-individual-per-service-pipelines-for-any-given-backend-service) - Single service testing

### Pipeline Timings
- Backend Pipeline: ~ 2min
- Frontend Pipeline: ~ 2min
- Deploy Pipeline: ~ 4min

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

### Running Individual Per-Service Pipelines for any given Backend Service (Run from each service root)
- `services/backend/agent-service`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/client-service`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/transaction-service`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/log-service`: `python run-local-test-pipeline.py` (Windows) or `python3 run-local-test-pipeline.py` (macOS/Linux)
