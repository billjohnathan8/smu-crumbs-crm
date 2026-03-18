# Configuration Guide

This document defines the canonical environment and database configuration contract for local, test, CI, staging, and production.

## Canonical DB Variable Contract

Use these variables consistently across stateful services (`user`, `client`, `transaction`, `log`).

| Variable | Scope | Default (Local/CI) | Notes |
|---|---|---|---|
| `LOCAL_DB_HOST` | Local/CI scripts | `localhost` (or `postgres` in compose network) | Used by orchestration scripts (`scripts/db`, `scripts/ci`). |
| `LOCAL_DB_PORT` | Local/CI scripts | `5432` | Used by orchestration scripts. |
| `LOCAL_DB_NAME` | Postgres container provisioning | `crm` (`crm_ci` in DB-backed component CI) | Drives `POSTGRES_DB`. |
| `LOCAL_DB_USER` | Postgres container provisioning | `crm_app` | Drives `POSTGRES_USER`. |
| `LOCAL_DB_PASSWORD` | Postgres container provisioning | `devpassword` | Drives `POSTGRES_PASSWORD`. |
| `DB_HOST` | App runtime (all stateful services) | `localhost` | Base host fallback for service configs. |
| `DB_PORT` | App runtime | `5432` | Base port fallback for service configs. |
| `DB_NAME` | App runtime | `crm` (`crm_ci` in DB-backed CI jobs) | Base DB name fallback for service configs. |
| `DB_USER` | App runtime | `crm_app` | Base username fallback for service configs. |
| `DB_PASSWORD` | App runtime | `devpassword` | Base password fallback for service configs. |
| `SPRING_DATASOURCE_URL` | Spring services (`user`, `client`, `transaction`) | `jdbc:postgresql://<host>:<port>/<db>` | Optional explicit override; otherwise derived from `DB_*`. |
| `SPRING_DATASOURCE_USERNAME` | Spring services | `crm_app` | Optional override; otherwise derived from `DB_USER`. |
| `SPRING_DATASOURCE_PASSWORD` | Spring services | `devpassword` | Optional override; otherwise derived from `DB_PASSWORD`. |
| `APP_USER_STORE_TYPE` | User service | `postgres` | Must be `postgres` for local integration/CI/prod paths. |
| `APP_TRANSACTIONS_STORE_TYPE` | Transaction service | `postgres` | Must be `postgres` for local integration/CI/prod paths. |
| `APP_ENV` | Log service runtime guardrail | `dev`/`test` | `prod` requires explicit secrets (direct env or `*_SECRET_ARN`). |

## Environment Matrix

| Environment | DB Engine/Target | Config Source | Store-Type Behavior | Secret Source |
|---|---|---|---|---|
| Local development | Docker Postgres (`docker-compose.localstack.yml`) | `LOCAL_DB_*` + service `.env`/shell vars | `APP_USER_STORE_TYPE=postgres`, `APP_TRANSACTIONS_STORE_TYPE=postgres` | Dev-only local values |
| Unit tests (service-local) | In-memory/H2 where test fixtures require it | `src/test/resources/application.yaml` in relevant services | In-memory stores allowed for fast isolated unit tests | Test fixtures only |
| DB-backed component CI | Ephemeral GitHub Actions Postgres service | Workflow env (`DB_*`, `SPRING_DATASOURCE_*`) | Postgres-backed persistence tests required for stateful services | Ephemeral CI values |
| Fullstack CI integration | Ephemeral compose Postgres + LocalStack | `scripts/ci/fullstack-integration.compose.yml` + `LOCAL_DB_*` | Postgres-backed runtime for all stateful services | Ephemeral CI values |
| Staging/Production | AWS RDS PostgreSQL | Terraform outputs + runtime env wiring | Postgres store types only | AWS Secrets Manager / environment injection |

## Service Behavior Summary

| Service | Local/Dev | Unit Test Default | CI DB-backed | Prod |
|---|---|---|---|---|
| `user` | PostgreSQL + Flyway | H2 + in-memory store in test resources | `PersistentUserStoreTest` against real Postgres | PostgreSQL on RDS |
| `client` | PostgreSQL + Flyway | Spring test profile defaults; integration uses Testcontainers Postgres | `ClientsServiceIT` (`-PincludeIntegration=true`) | PostgreSQL on RDS |
| `transaction` | PostgreSQL + Flyway | H2 + in-memory store in test resources | `PersistentTransactionsStoreTest` against real Postgres | PostgreSQL on RDS |
| `log` | PostgreSQL DSN (`DB_*`) + SQL migrations | Mostly mocked unit tests + optional DB integration tests | `test_repository_postgres_integration.py` against real Postgres | PostgreSQL on RDS with Secrets Manager wiring |

## Safety Guardrails

- Run `bash scripts/ci/guard-no-prod-db.sh` to validate local/CI config paths do not contain production-like DB endpoints.
- DB-backed CI workflows and fullstack integration workflows execute this guard.
- Do not commit real credentials; production secret management remains Terraform + Secrets Manager.

## Local Bootstrap Commands

```bash
# Start local infra
docker compose -f docker-compose.localstack.yml up -d

# Migrate + seed + verify shared Postgres
bash scripts/db/run-shared-postgres.sh migrate
bash scripts/db/run-shared-postgres.sh seed
bash scripts/db/run-shared-postgres.sh verify
bash scripts/db/run-shared-postgres.sh verify-seed
```

## Related Files

- `docker-compose.localstack.yml`
- `scripts/ci/fullstack-integration.compose.yml`
- `scripts/db/run-shared-postgres.sh`
- `scripts/ci/guard-no-prod-db.sh`
- `services/backend/*/.env.example`
