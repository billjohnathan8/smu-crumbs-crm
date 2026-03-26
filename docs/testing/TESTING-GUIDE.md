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

1. Backend lint / format / typecheck
2. Backend unit / component tests
3. Frontend lint / format / typecheck
4. Frontend unit / component tests
5. Frontend mocked E2E
6. Fullstack integration E2E (containers + LocalStack + HTTP smoke + Playwright)

## Runtime Baseline (Latest Local Runs)

Runtime numbers below are from the latest build logs on `2026-03-26`.

| Command | Observed runtime | Result |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | `902.8s` (~15m 3s) | Passed (`ok: true`) |
| Layer 6 step in `test_all.py` (`Fullstack integration (full)`) | `436.4s` (~7m 16s) | Passed |
| Fullstack script Phase 5 (`Playwright integration E2E`) | `77s` (~1m 17s) | Passed |

Layer totals from the same run:

| Layer | Duration |
|---|---:|
| Layer 1 - Backend Lint / Format / Typecheck | `182.6s` |
| Layer 2 - Backend Unit / Component Tests | `213.8s` |
| Layer 3 - Frontend Lint / Format / Typecheck | `73.6s` |
| Layer 4 - Frontend Unit / Component Tests | `89.0s` |
| Layer 5 - Frontend Mocked E2E | `94.8s` |
| Layer 6 - Fullstack Integration E2E | `436.4s` |

Source logs:
- `build-logs/test-all/last-run-summary.md`
- `build-logs/test-all/last-run-summary.json`

Expect runtime variance from Docker image cache state, npm/pip cache state, and LocalStack cold starts.

## Local Dev Stack (No Tests)

Spin up the full stack and leave it running — no assertions, no Playwright:

```bash
bash scripts/dev/stack-up.sh
```

Tear down:

```bash
bash scripts/dev/stack-down.sh
```

Use this for manual exploration, performance testing (e.g. JMeter), or debugging individual services without the full CI test suite.

> **Cleanup:** Repeated pipeline runs leave behind stopped LocalStack Lambda containers. Run `docker container prune` periodically to remove them, or see [../infrastructure/localstack-setup.md](../infrastructure/localstack-setup.md#7-cleaning-up-leftover-lambda-containers) for targeted cleanup commands.

## Fullstack Entry Points

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
bash scripts/ci/run-ingestion-verification-smoke.sh
```

`run-ingestion-verification-smoke.sh` forces `VERIFICATION_EMAIL_PROVIDER=ses` so the verification feedback Lambda path is asserted (not skipped).

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
