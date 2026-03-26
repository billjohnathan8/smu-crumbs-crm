
[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA Scroogebank Enterprise CRM
![AWS](https://img.shields.io/badge/AWS-Cloud%20Native-orange)
![Microservices](https://img.shields.io/badge/Architecture-Microservices-yellow)
![React](https://img.shields.io/badge/Frontend-React-63e5ff)
![Java](https://img.shields.io/badge/Backend-Springboot-green)
![Python](https://img.shields.io/badge/Backend-Python%20Lambda-006666)
![Terraform](https://img.shields.io/badge/IaC-Terraform-purple)
---
> A cloud-native, microservices-based, and enterprise Customer Relationship Management (CRM) system for Scrooge Global Bank - developed as the flagship project for CS301 IT Solution Architecture (ITSA).

# Tech Stack (Simplified)
- Terraform (IaC)
- React (frontend) + TypeScript + TailwindCSS
- Spring Boot (Java 21) + Python Lambda services (Python 3.12+)
- PostgreSQL, Docker

# Quickstart
```powershell
.\scripts\setup\setup-dev.ps1
```

Alternative:

```bash
python scripts/pipelines/setup_dev_env.py
```

If Python is not installed yet, start with [docs/onboarding/new-dev-setup.md](docs/onboarding/new-dev-setup.md).
On Linux/macOS/WSL, use `python3` if `python` is not available.

Note: `setup_dev_env.py` can install `inframap` without Docker (portable binary download). Docker Desktop is still required for container-based workflows and Docker fallback paths.

# Local Dev Stack

Spin up the full local stack (LocalStack, Postgres, all three Java backend services, frontend, nginx gateway, and all Lambda functions) and leave it running — no tests:

```bash
bash scripts/dev/stack-up.sh
```

Tear down:

```bash
bash scripts/dev/stack-down.sh
```

Services after startup:

| Service | URL |
|---|---|
| Gateway (UI entry point) | http://127.0.0.1:18088 |
| User service | http://127.0.0.1:18081 |
| Client service | http://127.0.0.1:18082 |
| Transaction service | http://127.0.0.1:18083 |
| Frontend container | http://127.0.0.1:18085 |
| LocalStack | http://127.0.0.1:14566 |

Root Admin Credentials (seeded by stack-up):

```
username:         admin@crm.local
default_password: Scrooge@Bank2026!
```

# AWS Learner Lab Deployment

One-command deployment to AWS Learner Lab (builds images, provisions infrastructure, pushes to ECR, deploys frontend):

```powershell
.\scripts\deploy-learnerlab.ps1
```

Bash (Linux/macOS/WSL):

```bash
./scripts/deploy-learnerlab.sh
```

The script is interactive — it prompts for AWS credentials and pauses for Terraform plan approval. Use skip flags for subsequent deploys (`-SkipBuild`, `-SkipInfra`, `-SkipFrontend`).

For Terraform-only operations (plan/apply/destroy) across any environment:

```powershell
.\scripts\deploy\deploy-aws.ps1 -Env lab
```

Full runbook: [docs/diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md](docs/diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md)

# Infrastructure Visualization
Use these commands from repo root to visualize Terraform infrastructure:

```bash
make inframap
make inframap-full
make terraform-graph
```

Docs:
- `docs/infrastructure/inframap-setup.md`
- `docs/README.md`

# Prerequisites
- Docker Desktop (or Docker Engine)
- Git
- Java 21
- Node.js 22+
- Python 3.12+
- Make

# Local/CI Runtime Snapshot (2026-03-26)
Measured on this repository's latest local run. Use as planning guidance, not an SLA.

| Command | Observed runtime | Source log |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | `902.8s` (~15m 3s) | `build-logs/test-all/last-run-summary.md` |
| `test_all.py` Layer 6 (`Fullstack integration (full)`) | `436.4s` (~7m 16s) | `build-logs/test-all/last-run-summary.md` |
| `test_all.py` Layer 5 (`Run mocked E2E`) | `67.2s` (~1m 7s) | `build-logs/test-all/last-run-summary.md` |
| `run-fullstack-integration-e2e.sh` Phase 5 (`Playwright integration E2E`) | `77s` (~1m 17s) | Latest fullstack build log output |

Notes:
- Latest `test_all.py` run passed all layers (`ok: true`).
- Latest fullstack integration run passed: `[PASS] Fullstack integration (full) (436.4s)`.
- Layer totals from the same run: Layer 1 `182.6s`, Layer 2 `213.8s`, Layer 3 `73.6s`, Layer 4 `89.0s`, Layer 5 `94.8s`, Layer 6 `436.4s`.
- Runtime varies with Docker cache, dependency cache, and LocalStack/container startup conditions.

# Database (Local Postgres)
- Host: `localhost` (or `postgres` inside Docker Compose network)
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: `devpassword`
- Runtime override vars (optional): `LOCAL_DB_NAME`, `LOCAL_DB_USER`, `LOCAL_DB_PASSWORD`
- Full environment matrix and variable contract: [docs/database_configuration.md](docs/database_configuration.md)

# Testing Credentials
Local development/testing only. Do not use these values for production deployments.

## Frontend
Root admin Email: admin@crm.local
Password: admin123

User Account Email: user@crm.local
Password: client123

## Database (Project-wide)
Created shared DB + user in Postgres:
DB: crm
User: crm_app
Password: devpassword

## Configuration Reference
- Central config contract: [docs/database_configuration.md](docs/database_configuration.md)
- LocalStack + local DB flow: [docs/infrastructure/localstack-setup.md](docs/infrastructure/localstack-setup.md)
- New developer setup: [docs/onboarding/new-dev-setup.md](docs/onboarding/new-dev-setup.md)
