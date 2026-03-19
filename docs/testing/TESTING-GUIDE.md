# Testing Guide

Run commands from repository root.

## Main Command

```bash
python scripts/pipelines/test_all.py
```

Use `python3` on Linux/macOS/WSL when needed.

## Common Variants

```bash
python scripts/pipelines/test_all.py --skip-fullstack
python scripts/pipelines/test_all.py --fullstack-mode smoke
python scripts/pipelines/test_all.py --skip-mocked-e2e
python scripts/pipelines/test_all.py --skip-terraform
python scripts/pipelines/test_all.py --skip-openapi
python scripts/pipelines/test_all.py --local-phase5
python scripts/pipelines/test_all.py --dry-run
```

## Suite Wrappers

```bash
python scripts/pipelines/test_backend.py
python scripts/pipelines/test_frontend.py
```

## Layer Order (`test_all.py`)

1. Lint / format / static checks
2. Unit and component tests
3. Frontend mocked E2E
4. Fullstack integration E2E (containers + LocalStack + Playwright)

## Runtime Baseline (Latest Local Runs)

Runtime numbers below are from the latest build logs on `2026-03-13`.

| Command | Observed runtime | Result |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | `656.1s` (~10m 56s) | Failed at Layer 4 (`Fullstack integration (full)` after `175.8s`) |
| `bash scripts/ci/run-fullstack-integration-e2e.sh` | `407s` (~6m 47s) | Passed |

Source logs:
- `build-logs/test-all/last-run-summary.md`
- `build-logs/fullstack-integration/20260313_224929-18799/docker-compose.log`

Expect runtime variance from Docker image cache state, npm/pip cache state, and LocalStack cold starts.

## Fullstack Entry Points

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
bash scripts/ci/run-ingestion-verification-smoke.sh
```

Before changing local/CI DB config files, run:

```bash
bash scripts/ci/guard-no-prod-db.sh
```

## Shared Postgres Bootstrap (Local/Test)

Use the standardized DB orchestration script for all stateful services (`user`, `client`, `transaction`, `log`):

```bash
# 1) Start local infra
docker compose -f docker-compose.localstack.yml up -d postgres localstack

# 2) Apply migrations (safe to rerun)
bash scripts/db/run-shared-postgres.sh migrate

# 3) Start backend services (user/client/transaction) then seed baseline principals
bash scripts/db/run-shared-postgres.sh seed

# 4) Verify schema and seed state
bash scripts/db/run-shared-postgres.sh verify
bash scripts/db/run-shared-postgres.sh verify-seed
```

Reset/rebuild local DB:

```bash
bash scripts/db/run-shared-postgres.sh reset
bash scripts/db/run-shared-postgres.sh migrate
```

Notes:
- `migrate` uses Flyway for Java services and the log service SQL migration runner (`services/backend/log/app/migrations` + `schema_migrations`).
- `seed` is idempotent; reruns do not duplicate baseline principals.
- `scripts/ci/run-fullstack-integration-e2e.sh` now uses the same `migrate` and `seed` flow.

## Output Locations

- Step logs: `build-logs/test-all/<timestamp>/`
- Latest summary (markdown): `build-logs/test-all/last-run-summary.md`
- Latest summary (json): `build-logs/test-all/last-run-summary.json`
- Frontend coverage: `services/frontend/crm-ui/coverage/index.html`

## Related Docs

- Onboarding: `docs/onboarding/new-dev-setup.md`
- LocalStack setup: `docs/infrastructure/localstack-setup.md`
