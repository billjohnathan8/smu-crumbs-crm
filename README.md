[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA CRM Repository

# **Notes to the team:** 
Before development work, please read through (open all markdown files using `'Open in Preview'` for better UI):
1. **[The Tech Stack](docs\main-diagrams\tech-stack.md)** and configure your laptops/machines to be able to run all those technologies
2. **API Contracts** under `/docs/api-contracts/openapi` for your relevant service api.
3. **[The Coding Standards](docs\coding-standards\coding-standards.md)** during dev work and before creating branches, pushing to remote (github), or creating PRs.

what was done:
1. refactored backend services to have /health endpoints and also added all tests and made sure all tests are good
2. added localized testing and pipeline - checkstyle, junit, mockito, jacoco, black, flake8, pytest, pytest-cov 
3. integrated all backend services into k8s infrastructure
4. added localized deployment for k8s

WIP:
5. added frontend & testing for frontend 
6. added localized testing for frontend and E2E via playwright
7. added localized testing of k8s deployment
8. planning for production

Meeting Agenda:
1. Decide on a Team Name & Project Submission Name
2. Updates on Repo Changes
3. Close all PRs and perform Merges to Main
4. Discuss X-Factor
5. Roadmapping + Division of New Work
6. Non-Technical Work: Slides, Report, AWS Diagram (im cooking this rn)

Everyone:
- team name & project name 
- ensure it can run locally on your machine when pulled (backend takes ~2min, deploy takes ~(3-4)min)
- test by running all scripts
- brief on all changes
- close all PRs and make all merges
- xfactor
- do local testing, then push to CI, then if it fails there - come back and make the changes.

Frontend Team:
- Integrate E2E Testing using Playwright
- Work with backend on integration tests with frontend
- UI/UX considerations

Backend Team Workload:
- check that business logic is correct & covers all brief minimum requirements
- check test correctness
- ensure test coverage is >85% for line & >75% for branch + all test cases pass 
- refactor any issues
- no-auth is for pre-auth -> implement OAuth2.0
- naturally this includes mock DB + mock SFTP
- figure out which services need to become or need separate lambdas
- write integration tests between services (smoke tests first)
- assign one person to do integration between frontend and backend if necessary
- design non-functional testing for backend services
- optimize backend services accordingly (e.g .rewrite into different language golang, c++, rust or etc.)

DevOps:
- matteo + dexue
- integrate linting libraries into the github actions
- integrate argocd
- integrate prometheus and grafana
- integrate istio & kiali
devops -> caching of images and testing - makes the dev experience better and faster.

k8s + deployment of infra: 
- migration to cloud
- bill
- terraform
- aws costing 
- iam roles
- helm files
- autoscaling
- kargo
- prod env


**Notes:**
> Local development is fully supported on kind without AWS dependencies. AWS-oriented docs can still coexist for target-state planning.

## Quick commands (repo root)
For build logs after script runs refer to `build-logs`.

Remember to commit each git log whenever relevant after making code changes.

### Backend local build/test
```powershell
.\scripts\build-and-test\build-and-test-backend.ps1
```
```cmd
.\scripts\build-and-test-backend.cmd
```
```bash
bash ./scripts/build-and-test/build-and-test-backend.sh
```

Outputs:
- Full terminal output is captured to `build-logs/build-and-test/*.log` (newest-first naming).
- An aggregated backend coverage summary is generated at `build-logs/build-and-test/index.html` (links to per-service JaCoCo/coverage reports).
- Open `build-logs/build-and-test/index.html` directly in a normal browser window (`file:///...`); do not use VS Code **Open Preview** for this report.
- Full pipeline design and report guide: `docs/testing/backend-local-pipeline.md`

### Backend test + local Kubernetes deploy (one command)
```powershell
.\scripts\build-and-test-and-deploy\build-and-test-and-deploy-k8s-local.ps1
```
```cmd
.\scripts\build-and-test-and-deploy-k8s-local.cmd
```
```bash
bash ./scripts/build-and-test-and-deploy/build-and-test-and-deploy-k8s-local.sh
```

Notes:
- Runs the backend test pipeline first. If tests fail, deployment is skipped.
- Logs are captured under both `build-logs/build-and-test` and `build-logs/build-and-deploy`.

### Per-service local test pipeline (run from each service root)
- `services/backend/user-service`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/clients-service`: `.\gradlew.bat localTestPipeline` (Windows) or `./gradlew localTestPipeline` (macOS/Linux)
- `services/backend/log-service`: `python run-local-test-pipeline.py` (Windows) or `python3 run-local-test-pipeline.py` (macOS/Linux)

### Backend local Kubernetes deploy (kind)
```powershell
.\scripts\build-and-deploy\build-and-deploy-k8s-local.ps1
```
```cmd
.\scripts\build-and-deploy-k8s-local.cmd
```
```bash
bash ./scripts/build-and-deploy/build-and-deploy-k8s-local.sh
```

Outputs:
- Full terminal output is captured to `build-logs/build-and-deploy/*.log` (newest-first naming).

For full setup, verification, troubleshooting, and teardown, use `docs/local-k8s-dev.md`.
