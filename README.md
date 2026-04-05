
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

# Getting Started

## 1. Prerequisites

- Git
- Docker Desktop (or Docker Engine)
- Java 21
- Node.js 22+
- Python 3.12+
- Make

Python command mapping:
- Windows PowerShell: `python`
- Linux/macOS/WSL: `python3`

Quick checks:

```powershell
python --version
python -m pip --version
```

```bash
python3 --version
python3 -m pip --version
```

## 2. Run setup

Windows (recommended):

```powershell
.\scripts\setup\setup-dev.ps1
```

Cross-platform:

```bash
python scripts/pipelines/setup_dev_env.py
```

`setup_dev_env.py` can install portable CLI tools (for example `inframap`, `trivy`) into `.devtools/bin`. It does not install Python.

## 3. Create `.env.local`

Copy `.env.example` to `.env.local` at repo root (gitignored) and set all required keys:

| Variable | Purpose |
|----------|---------|
| `LOCAL_DB_PASSWORD` | Postgres (`crm_app`) password |
| `JWT_HMAC_SECRET` | Shared HS256 secret for Java services and local Lambdas |
| `E2E_ADMIN_PASSWORD` | Root admin login + user-service seed |
| `E2E_USER_PASSWORD` | Seeded agent user (e.g. `agent1@crm.com`) |

```bash
cp .env.example .env.local
```

`scripts/dev/stack-up.sh`, `scripts/ci/run-fullstack-integration-e2e.sh`, and `scripts/pipelines/test_all.py` auto-load `.env.local` for local runs.

## 4. Start local stack

```bash
bash scripts/dev/stack-up.sh
```

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

## 5. Validate locally

```bash
python scripts/pipelines/test_all.py
```

Useful flags:

```bash
python scripts/pipelines/test_all.py --skip-fullstack
python scripts/pipelines/test_all.py --fullstack-mode smoke
python scripts/pipelines/test_all.py --dry-run
```

## 6. Quick troubleshooting

- Python not found: use `python` on Windows and `python3` on Linux/macOS/WSL.
- Setup fails on missing tools: run `python scripts/pipelines/setup_dev_env.py --doctor`.
- Stack startup issues: run `bash scripts/dev/stack-down.sh`, then retry `bash scripts/dev/stack-up.sh`.
- Fullstack startup issues: rerun `bash scripts/ci/run-fullstack-integration-e2e.sh` and inspect `build-logs/fullstack-integration/`.

Related docs:
- [docs/database_configuration.md](docs/database_configuration.md)
- [docs/testing/TESTING-GUIDE.md](docs/testing/TESTING-GUIDE.md)
- [docs/infrastructure/localstack-setup.md](docs/infrastructure/localstack-setup.md)

Root admin email (seeded by stack-up): `admin@crm.com`. Use `.env.local` for known local passwords.

# OWASP ZAP Baseline Scan

For a quick security pass against the local gateway, run the Dockerized ZAP baseline scan from Windows PowerShell:

```powershell
powershell -File .\scripts\security\run-zap-baseline.ps1 -StartDevStack -OpenReport
```

That command starts the local dev stack, waits for the gateway at `http://127.0.0.1:18088`, then writes HTML and JSON reports under `build-logs/zap/`.

If you want to scan a staging clone instead of the local stack, pass `-TargetUrl` to the same script and keep it outside production.

To scan an authenticated staging environment, run:

```powershell
powershell -File .\scripts\security\run-zap-baseline.ps1 -TargetUrl https://staging.example.com -Authenticated -LoginEmail admin@example.com -LoginPassword $env:E2E_ADMIN_PASSWORD -OpenReport
```

That mode logs in through `/api/auth/login`, adds the bearer token to ZAP requests, and then scans authenticated pages as well.

# Infrastructure Visualization
Use these commands from repo root to visualize Terraform infrastructure:

```bash
make inframap
make inframap-full
make terraform-graph
```

Alternatively, use Brainboard.

# Local/CI Runtime Snapshot (2026-03-30)
Measured on this repository's latest local run. Use as planning guidance, not an SLA.

| Command | Observed runtime | Source log |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | `3410.1s` (~56m 50s) | `build-logs/test-all/last-run-summary.md` |
| `test_all.py` Layer 6 (`Fullstack integration (full)`) | `962.7s` (~16m 03s) | `build-logs/test-all/last-run-summary.md` |
| `test_all.py` Layer 5 (`Frontend Latency Tests`) | `131.1s` (~2m 11s) | `build-logs/test-all/last-run-summary.md` |
| `test_all.py` Layer 7 (`Performance test (stress)`) | `879.3s` (~14m 39s) | `build-logs/test-all/last-run-summary.md` |

Notes:
- Latest `test_all.py` run passed all recorded steps.
- Latest fullstack integration run passed: `[PASS] Fullstack integration (full) (962.7s)`.
- Full per-step timings for all layers are in `build-logs/test-all/last-run-summary.md` (total: `3410.1s`).
- Runtime varies with Docker cache, dependency cache, and LocalStack/container startup conditions.

# Transaction Ingestion

Transaction CSV files can be ingested via three supported methods:

1. **SFTP Endpoint** (EC2 self-hosted)
   - Real SFTP protocol with SSH key-based authentication
   - Prod default uses EC2 OpenSSH SFTP with S3-backed upload path
   - Files land in S3 bucket -> Lambda collector -> Transaction import API
   - See [docs/infrastructure/sftp-setup.md](docs/infrastructure/sftp-setup.md)

2. **Direct S3 Upload** (all environments)
   - AWS CLI or SDK upload to S3 bucket
   - Lambda collector picks up files on schedule
   - Script: `scripts/ci/seed-transaction-fixture.sh`

3. **Filesystem Mock** (local dev only)
   - Transaction service reads directly from `MOCK_SFTP_ROOT`
   - No S3 upload required

**Contract**: [docs/api-contracts/sftp-transaction-ingestion-contract.md](docs/api-contracts/sftp-transaction-ingestion-contract.md)

# Database (Local Postgres)
- Host: `localhost` (or `postgres` inside Docker Compose network)
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: use `LOCAL_DB_PASSWORD` / `DB_PASSWORD` (see [docs/database_configuration.md](docs/database_configuration.md) for local defaults)
- Runtime override vars (optional): `LOCAL_DB_NAME`, `LOCAL_DB_USER`, `LOCAL_DB_PASSWORD`
- Full environment matrix and variable contract: [docs/database_configuration.md](docs/database_configuration.md)

# Testing Credentials
Local development/testing only. Do not use committed defaults for production.

## Frontend
- Root admin: `admin@crm.com` — set `E2E_ADMIN_PASSWORD` (or rely on dev defaults from `scripts/dev/stack-up.sh` when unset).
- Sample user: `agent1@crm.com` — set `E2E_USER_PASSWORD` the same way.

## Database (Project-wide)
Shared Postgres (`crm` / `crm_app`): configure via `LOCAL_DB_PASSWORD` and related vars; see [docs/database_configuration.md](docs/database_configuration.md).

## Configuration Reference
- Central config contract: [docs/database_configuration.md](docs/database_configuration.md)
- LocalStack + local DB flow: [docs/infrastructure/localstack-setup.md](docs/infrastructure/localstack-setup.md)
- Setup and troubleshooting quickstart: [#getting-started](#getting-started)
