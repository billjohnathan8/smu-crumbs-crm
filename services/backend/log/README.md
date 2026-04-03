# Log Service

Audit logging, AML alert persistence, and verification communication microservice for the Scrooge Bank CRM. Runs as an AWS Lambda function invoked directly through API Gateway.

## Overview

The Log Service is the central write-through store for three concerns:

1. **Audit logs** — immutable records of every create/update/delete action across the CRM (user, client, transaction).
2. **AML alerts** — persists and exposes flagged alerts written by the AML batch engine (Feature 5) for human review.
3. **Communications** — tracks outbound verification emails and processes SES delivery feedback (bounces, complaints).

It runs as a direct API Gateway proxy Lambda (`lambda_function.lambda_handler`) using a custom `LambdaRouter` that handles both HTTP API v2 and REST proxy event shapes.

**Technology Stack:**
- Python 3.13
- AWS Lambda (API Gateway proxy)
- PostgreSQL via psycopg
- Pydantic (data validation and schemas)
- pytest + pytest-cov (testing)
- black + flake8 (formatting and linting)

## API Contract

**OpenAPI Specification:** [`docs/api-contracts/openapi/log.yaml`](../../../docs/api-contracts/openapi/log.yaml)

**Key Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Primary health check |
| `GET` | `/api/v1/health` | Legacy health endpoint |
| `GET` | `/api/v1/logs/health` | Legacy logs health endpoint |
| `GET` | `/api/logs` | List audit log entries |
| `POST` | `/api/logs` | Create audit log entry |
| `GET` | `/api/logs/{logId}` | Get audit log entry |
| `PUT` | `/api/logs/{logId}` | Update audit log entry |
| `DELETE` | `/api/logs/{logId}` | Delete audit log entry |
| `GET` | `/api/clients/{clientId}/logs` | List log entries for a client |
| `POST` | `/api/aml/alerts` | Create AML alert |
| `GET` | `/api/aml/alerts` | List AML alerts |
| `GET` | `/api/aml/alerts/{alertId}` | Get AML alert |
| `PUT` | `/api/aml/alerts/{alertId}/review` | Review (approve/dismiss) AML alert |
| `POST` | `/api/communications` | Create communication record |
| `GET` | `/api/communications` | List communications (paginated, filterable) |
| `GET` | `/api/communications/queued` | List queued communications |
| `GET` | `/api/communications/{communicationId}` | Get communication |
| `PATCH` | `/api/communications/{communicationId}/status` | Update communication status |
| `PATCH` | `/api/communications/provider/{providerMessageId}/status` | Update status by SES message ID |
| `GET` | `/api/clients/{clientId}/communications` | List communications for a client |

## Local Development

### Running Tests

From the **repository root**, use the unified Python pipeline:

```bash
# Test log service only
python scripts/pipelines/test_backend.py --service log

# Test all backend services
python scripts/pipelines/test_backend.py
```

**Or from this directory** (`services/backend/log`):

Windows:
```powershell
python run-local-test-pipeline.py
```

macOS/Linux:
```bash
python3 run-local-test-pipeline.py
```

Alternative wrappers:
- `run-local-test-pipeline.cmd`
- `run-local-test-pipeline.sh`

> PowerShell does not run scripts from the current directory unless you prefix with `.\` (e.g. `.\run-local-test-pipeline.cmd`).
> `run-local-test-pipeline.sh` requires Bash (WSL / Git Bash); it won't run in plain Windows PowerShell.

**Pipeline stages:**
1. **Lint** — `black --check`, `flake8`
2. **Build check** — `python -m compileall`
3. **Tests** — `pytest`
4. **Coverage report** — `pytest-cov` (branch coverage enabled)

### Test Reports

| Report | Location |
|--------|----------|
| **JUnit XML** | `build/reports/tests/junit.xml` |
| **Coverage XML** | `build/reports/coverage/coverage.xml` |
| **Coverage HTML** | `build/reports/coverage/html/index.html` |

Lambda handler coverage is included via `tests/test_lambda_handler.py`.

### Running Locally (Standalone)

The service requires a PostgreSQL database. Start with dev defaults:

```bash
# Ensure a local Postgres instance is running, then:
APP_ENV=dev python -c "from lambda_function import lambda_handler; print('OK')"
```

For full local integration, use LocalStack via the repo's CI topology (see [Local/CI Topology](#localci-topology)).

**Default local DB connection:**
- Host: `localhost`
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: set `DB_PASSWORD` / `LOCAL_DB_PASSWORD` (repo root `.env.local`; see root `.env.example`)

## Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.
Use `services/backend/log/.env.example` as the baseline local/dev template.

**Key environment variables:**

| Variable | Local / notes | Description |
|----------|---------------|-------------|
| `APP_ENV` | `dev` | Runtime environment. Use `dev`, `local`, or `test`; `prod` requires explicit secrets (no committed password defaults). |
| `DB_HOST` | `localhost` | PostgreSQL host (`postgres` in compose network) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `crm` | Database name |
| `DB_USER` | `crm_app` | Database user (dev only) — use `DB_USER_SECRET_ARN` in prod |
| `DB_PASSWORD` | _(required in dev)_ | Set via env / `.env.local` — use `DB_PASSWORD_SECRET_ARN` in prod |
| `JWT_HMAC_SECRET` | _(required in dev)_ | Set via env / `.env.local` — use `JWT_HMAC_SECRET_ARN` in prod |
| `AUTH_MODE` | `hybrid` (dev) / `cognito` (prod) | Authentication mode: `local`, `cognito`, or `hybrid` |
| `ALLOW_HYBRID_AUTH` | `true` (dev) | Allows both HS256 and RS256 trust; disabled in prod by default |
| `COGNITO_JWKS_URL` | _(empty)_ | Cognito JWKS endpoint — required when `AUTH_MODE=cognito` |
| `COGNITO_ISSUER` | _(empty)_ | Cognito token issuer — required when `AUTH_MODE=cognito` |
| `COGNITO_CLIENT_ID` | _(empty)_ | Cognito App Client ID (audience claim) |
| `CLIENT_SERVICE_URL` | `http://localhost:8080` | Base URL for client service calls |
| `DB_USER_SECRET_ARN` | _(empty)_ | Secrets Manager ARN for DB user (prod) |
| `DB_PASSWORD_SECRET_ARN` | _(empty)_ | Secrets Manager ARN for DB password (prod) |
| `JWT_HMAC_SECRET_ARN` | _(empty)_ | Secrets Manager ARN for JWT HMAC secret (prod) |

## Project Structure

```
services/backend/log/
├── lambda_function.py       # Lambda entrypoint and handler
├── app/
│   ├── lambda_router.py     # API Gateway event router (HTTP API v2 + REST proxy)
│   ├── auth.py              # JWT authentication (HS256 + Cognito RS256)
│   ├── client_scope.py      # Client-scoped authorization checks
│   ├── config.py            # Settings loaded from environment variables
│   ├── schemas.py           # Pydantic request/response models
│   ├── service.py           # Business logic
│   ├── repository.py        # PostgreSQL data access
│   └── migrations/          # Database migration scripts
├── tests/
│   └── test_lambda_handler.py  # Handler and integration tests
├── requirements.txt         # Python dependencies
├── run-local-test-pipeline.py   # Local test pipeline runner
└── README.md                # This file
```

## Deploy as AWS Lambda

### Handler

- Lambda handler: `lambda_function.lambda_handler`
- Runtime: `python3.13`

### Zip package

Install dependencies into a package directory and zip:

```powershell
mkdir package
pip install -r requirements.txt -t package
Copy-Item lambda_function.py package\
Copy-Item -Recurse app package\app
cd package
Compress-Archive -Path * -DestinationPath ..\log-lambda.zip -Force
```

Use Terraform `aws_lambda_function` with:

- `filename = "log-lambda.zip"`
- `handler = "lambda_function.lambda_handler"`
- `runtime = "python3.13"`

## Local/CI Topology

The repository's local/CI integration topology does not run this service as a dedicated long-running HTTP container. Tests provision and invoke it through a Lambda-compatible HTTP integration path in LocalStack (see `scripts/ci/run-fullstack-integration-e2e.sh`).

## Related Documentation

- **[Testing Guide](../../../docs/testing/TESTING-GUIDE.md)** — Testing workflows
- **[Configuration Guide](../../../docs/configuration.md)** — Environment variables and config
- **[API Contract](../../../docs/api-contracts/openapi/log.yaml)** — OpenAPI specification
- **[Contributing Guide](../../../CONTRIBUTING.md)** — Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
