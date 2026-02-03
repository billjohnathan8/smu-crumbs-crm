[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# **Notes to the team:** 
Before development work, please read through:
1. **[The Tech Stack](docs\main-diagrams\tech-stack.md)** and configure your laptops/machines to be able to run all those technologies
2. **API Contracts** under `/docs/api-contracts/openapi` for your relevant service api.
3. **[The Coding Standards](docs\coding-standards\coding-standards.md)** during dev work and before creating branches, pushing to remote (github), or creating PRs.

# **For Local Testing of Services (Local CI/CD):**
## Running from `root` (Windows):
```powershell
.\scripts\build-and-test\build-and-test-backend.ps1
```
or:
```Command Prompt
.\scripts\build-and-test-backend.cmd
```
or (macOS/Linux):
```bash
bash ./scripts/build-and-test/build-and-test-backend.sh
```

## Running from `/scripts` (Windows):
```powershell
.\build-and-test\build-and-test-backend.ps1
```
or:
```Command Prompt
.\build-and-test-backend.cmd
```
or (macOS/Linux):
```bash
bash ./build-and-test/build-and-test-backend.sh
```

# **For Local Kubernetes Backend (kind):**
## Running from `root` (Windows):
```powershell
.\scripts\build-and-deploy\build-and-deploy-k8s-local.ps1
```
or:
```Command Prompt
.\scripts\build-and-deploy-k8s-local.cmd
```
or (macOS/Linux):
```bash
bash ./scripts/build-and-deploy/build-and-deploy-k8s-local.sh
```

## Running from `/scripts` (Windows):
```powershell
.\build-and-deploy\build-and-deploy-k8s-local.ps1
```
or:
```Command Prompt
.\build-and-deploy-k8s-local.cmd
```
or (macOS/Linux):
```bash
bash ./build-and-deploy/build-and-deploy-k8s-local.sh
```
## Running raw commands from `root`: 
See `docs/local-k8s-dev.md` for full details.


### Running from Bash Shell:
Equivalent command from repo root (bash-compatible shell):
```bash
make kind-up && make infra-up && make build-images && make kind-load && make deploy-dev && make smoke
```

### Running from Powershell:
Equivalent command from repo root (PowerShell):
```powershell
make kind-up; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
make infra-up; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
make build-images; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
make kind-load; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
make deploy-dev; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
make smoke; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```
