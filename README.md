
[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA Scroogebank Enterprise CRM
![AWS](https://img.shields.io/badge/AWS-Cloud%20Native-orange)
![Microservices](https://img.shields.io/badge/Architecture-Microservices-yellow)
![React](https://img.shields.io/badge/Frontend-React-63e5ff)
![Java](https://img.shields.io/badge/Backend-Springboot-green)
![Python](https://img.shields.io/badge/Backend-FastAPI-006666)
![Terraform](https://img.shields.io/badge/IaC-Terraform-purple)
---
> A cloud-native, microservices-based, and enterprise Customer Relationship Management (CRM) system for Scrooge Global Bank - developed as the flagship project for CS301 IT Solution Architecture (ITSA).

# Tech Stack (Simplified)
- Terraform (IaC)
- React (frontend) + TypeScript + TailwindCSS
- Spring Boot (Java 21) + FastAPI (Python 3.12+)
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
- `docs/infrastructure/README.md`

# Prerequisites
- Docker Desktop (or Docker Engine)
- Git
- Java 21
- Node.js 22+
- Python 3.12+
- Make

# Database (Local Postgres)
- Database: `cs301`
- User: `cs301`
- Password: `cs301_local_dev_pw`
- Shared DB/User (project-wide): `crm` / `crm_app` / `crm_local_dev_pw`

# Testing Credentials
Local development/testing only. Do not use these values for production deployments.

## Frontend
Root admin Email: admin@crm.local
Password: admin123

Agent Account Email: agent@crm.local
Password: client123

## Database (Project-wide)
Created shared DB + user in Postgres:
DB: crm
User: crm_app
Password: crm_local_dev_pw

Existing service DB is still:
DB: cs301
User: cs301
Password: cs301_local_dev_pw
