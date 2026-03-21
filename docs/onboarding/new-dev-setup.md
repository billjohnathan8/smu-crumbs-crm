# New Developer Setup

Run all commands from the repository root.

## Prerequisites

- Git
- Docker Desktop (or Docker Engine)
- Java 21
- Node.js 22+
- Python 3.12+
- Make

Python command mapping:
- Windows PowerShell: `python`
- Linux/macOS/WSL: `python3`

## 1. Verify Python

Windows:

```powershell
python --version
python -m pip --version
```

Linux/macOS/WSL:

```bash
python3 --version
python3 -m pip --version
```

If this fails, see [../prerequisites/PYTHON-REQUIREMENT.md](../prerequisites/PYTHON-REQUIREMENT.md).

## 2. Run setup

Windows (recommended):

```powershell
.\scripts\setup\setup-dev.ps1
```

Cross-platform:

```bash
python scripts/pipelines/setup_dev_env.py
```

Use `python3` where required.

## 3. Start local dev stack

To spin up the full local stack (LocalStack, Postgres, all backend services, frontend, gateway, and all Lambda functions) and leave it running:

```bash
bash scripts/dev/stack-up.sh
```

Tear down when done:

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

**Infra-only alternative** (LocalStack + Postgres only, no app services):

```bash
docker compose -f docker-compose.localstack.yml up -d
```

Database settings used across local integration flows:
- Host: `localhost` (or `postgres` from Docker network)
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: `devpassword`

Canonical config reference:
- [../database_configuration.md](../database_configuration.md)
- Service env templates:
  - `services/backend/user/.env.example`
  - `services/backend/client/.env.example`
  - `services/backend/transaction/.env.example`
  - `services/backend/log/.env.example`

## 4. Run validation

```bash
python scripts/pipelines/test_all.py
```

Useful options:

```bash
python scripts/pipelines/test_all.py --skip-fullstack
python scripts/pipelines/test_all.py --fullstack-mode smoke
python scripts/pipelines/test_all.py --local-phase5
python scripts/pipelines/test_all.py --dry-run
```

## 5. Deploy to AWS Learner Lab (optional)

To deploy the full application to AWS Learner Lab:

```powershell
.\scripts\deploy-learnerlab.ps1
```

Or on Linux/macOS/WSL:

```bash
./scripts/deploy-learnerlab.sh
```

This builds all backend services, provisions AWS infrastructure via Terraform, pushes Docker images to ECR, builds and deploys the frontend to S3, and runs health checks. The script prompts for AWS credentials interactively.

Prerequisites: AWS CLI, Terraform >= 1.10.0 (in addition to the tools above).

Full runbook: [../diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md](../diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md)

## Windows + WSL

Python installation is per environment. If you use both Windows and WSL shells, install Python in both.
