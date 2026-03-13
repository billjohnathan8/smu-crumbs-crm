# LocalStack Setup

This project uses LocalStack for local integration workflows.

LocalStack emulates AWS services used by the stack (SQS, DynamoDB, S3, Lambda, SNS, SES, Secrets Manager).

## Prerequisites

- Docker running
- Python 3.12+
- AWS CLI (optional but useful)

## 1. Start LocalStack + Postgres

```bash
docker compose -f docker-compose.localstack.yml up -d
```

Local Postgres contract for stateful services (`agent`, `client`, `transaction`, `log`):
- Host: `localhost` (or `postgres` from Docker network)
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: `devpassword`
- Canonical environment matrix and variable contract: [../configuration.md](../configuration.md)

Optional overrides when launching compose:

```bash
LOCAL_DB_NAME=crm LOCAL_DB_USER=crm_app LOCAL_DB_PASSWORD=devpassword docker compose -f docker-compose.localstack.yml up -d
```

Health check:

```bash
curl http://localhost:4566/_localstack/health
docker compose -f docker-compose.localstack.yml exec postgres pg_isready -U crm_app -d crm
```

## 1b. Standardized DB Migrate / Seed / Verify

Apply schema migrations for all stateful services:

```bash
bash scripts/db/run-shared-postgres.sh migrate
```

Seed baseline local/test principals (requires `agent-service` running):

```bash
bash scripts/db/run-shared-postgres.sh seed
```

Verify schema and seed state:

```bash
bash scripts/db/run-shared-postgres.sh verify
bash scripts/db/run-shared-postgres.sh verify-seed
```

Reset and rebuild local DB when needed:

```bash
bash scripts/db/run-shared-postgres.sh reset
bash scripts/db/run-shared-postgres.sh migrate
```

Notes:
- `migrate` is deterministic and rerunnable.
- Java services are migrated via Flyway; log service migrations use `services/backend/log/app/migrations` with `schema_migrations` tracking.
- `seed` is idempotent and safe to run multiple times.
- Before changing local/CI DB config, run `bash scripts/ci/guard-no-prod-db.sh`.

## 2. Resource Bootstrap

`platform/localstack/init/01-setup.sh` is auto-run by LocalStack on startup.
It provisions baseline queues, tables, buckets, topic, and secrets used by local flows.

## 3. Optional CLI Access

Install `awslocal`:

```bash
pip install awscli-local
awslocal sqs list-queues
```

## 4. Run Fullstack Integration (Recommended)

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
```

This script handles service startup, standardized DB migrate/seed orchestration, log Lambda/API provisioning, smoke checks, and integration Playwright tests.

## 5. Teardown

```bash
docker compose -f docker-compose.localstack.yml down -v
```

## Troubleshooting

- If startup fails, inspect `docker compose logs localstack`.
- If fullstack tests fail, inspect `build-logs/fullstack-integration/`.
