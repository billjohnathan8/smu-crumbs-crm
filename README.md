[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA CRM Repository

# **Notes to the team:** 
Before development work, please read through:
1. **[The Tech Stack](docs\main-diagrams\tech-stack.md)** and configure your laptops/machines to be able to run all those technologies
2. **API Contracts** under `/docs/api-contracts/openapi` for your relevant service api.
3. **[The Coding Standards](docs\coding-standards\coding-standards.md)** during dev work and before creating branches, pushing to remote (github), or creating PRs.

> Local development is fully supported on kind without AWS dependencies. AWS-oriented docs can still coexist for target-state planning.

## Quick commands (repo root)

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

For full setup, verification, troubleshooting, and teardown, use `docs/local-k8s-dev.md`.
