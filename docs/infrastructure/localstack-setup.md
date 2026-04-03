# LocalStack Setup

This project uses LocalStack for local integration workflows.

LocalStack emulates AWS services used by the stack (SQS, DynamoDB, S3, Lambda, SNS, SES, Secrets Manager).

## Prerequisites

- Docker running
- Python 3.12+
- AWS CLI (optional but useful)

## 1. Start LocalStack + Postgres

Export secrets from repo root `.env.local` (see [../onboarding/new-dev-setup.md](../onboarding/new-dev-setup.md) and root `.env.example`). **Required** for this compose file: `LOCAL_DB_PASSWORD`, `JWT_HMAC_SECRET`, and `E2E_ADMIN_PASSWORD` (LocalStack init seeds Secrets Manager and must match Postgres).

```bash
set -a && source .env.local && set +a   # Bash; on PowerShell, set each variable or use a dotenv loader
docker compose -f docker-compose.localstack.yml up -d
```

Local Postgres contract for stateful services (`user`, `client`, `transaction`, `log`):
- Host: `localhost` (or `postgres` from Docker network)
- Port: `5432`
- Database: `crm`
- User: `crm_app`
- Password: value of `LOCAL_DB_PASSWORD` (not committed)
- Canonical environment matrix and variable contract: [../database_configuration.md](../database_configuration.md)

Optional overrides when launching compose:

```bash
LOCAL_DB_NAME=crm LOCAL_DB_USER=crm_app LOCAL_DB_PASSWORD="$LOCAL_DB_PASSWORD" docker compose -f docker-compose.localstack.yml up -d
```

Health check:

```bash
curl http://localhost:4566/_localstack/health
docker compose -f docker-compose.localstack.yml exec postgres pg_isready -U crm_app -d crm
```

## 1.1 Standardized DB Migrate / Seed / Verify

Apply schema migrations for all stateful services:

```bash
bash scripts/db/run-shared-postgres.sh migrate
```

Seed baseline local/test principals (requires `user-service` running):

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

## 4. Local Dev Stack (No Tests)

Spin up the full stack (all services, gateway, and all Lambda functions) and leave it running — no assertions, no Playwright:

```bash
bash scripts/dev/stack-up.sh
```

Tear down:

```bash
bash scripts/dev/stack-down.sh
```

Root admin email (seeded by stack-up): `admin@crm.com`. Set `E2E_ADMIN_PASSWORD` / `E2E_USER_PASSWORD` as needed; if unset, dev defaults are applied by `scripts/dev/stack-up.sh`.

## 5. Run Fullstack Integration E2E (CI / Test Pipeline)

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
```

This script handles service startup, standardized DB migrate/seed orchestration, all Lambda/API provisioning, smoke checks, and integration Playwright tests. Containers are torn down automatically on exit.

## 6. Teardown

If you used `stack-up.sh`:

```bash
bash scripts/dev/stack-down.sh
```

If you only started infra (`docker-compose.localstack.yml`):

```bash
docker compose -f docker-compose.localstack.yml down -v
```

## 7. Cleaning Up Leftover Lambda Containers

LocalStack creates a separate Docker container for each Lambda invocation. These containers accumulate across repeated pipeline runs and can grow to dozens or hundreds of stopped containers.

**Check for leftover containers:**

```bash
docker ps -a --filter "ancestor=lambda/python:3.12" --filter "status=exited"
```

**Remove only LocalStack Lambda containers:**

```bash
docker rm $(docker ps -a -q --filter "ancestor=lambda/python:3.12" --filter "status=exited")
```

**Remove all stopped containers (broader cleanup):**

```bash
docker container prune
```

**Full cleanup (stopped containers, unused images, networks, and build cache):**

```bash
docker system prune
```

> **Tip:** Always tear down with `stack-down.sh` or `docker compose down -v` when you are done. This removes the LocalStack container and its spawned Lambda containers. If you kill Docker or containers without a proper teardown, orphaned Lambda containers will remain.

## Troubleshooting

- If startup fails, inspect `docker compose logs localstack`.
- If fullstack tests fail, inspect `build-logs/fullstack-integration/`.
- If `stack-up.sh` fails at gateway health check, check `build-logs/dev-stack/docker-build.log` for Docker build errors.
