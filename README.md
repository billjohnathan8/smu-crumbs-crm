
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

# Local/CI Runtime Snapshot (2026-03-13)
Measured on this repository's latest local runs. Use as planning guidance, not an SLA.

| Command | Observed runtime | Source log |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | `656.1s` (~10m 56s) | `build-logs/test-all/last-run-summary.md` |
| `bash scripts/ci/run-fullstack-integration-e2e.sh` | `407s` (~6m 47s) | `build-logs/fullstack-integration/20260313_224929-18799/docker-compose.log` |

Notes:
- The latest `test_all.py` run reached Layer 4 and failed in fullstack (`175.8s`) after earlier layers passed.
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
