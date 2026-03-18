# Integration Tests

Full-stack Playwright tests for the Scroogebank CRM platform.

## Purpose

These tests validate the live stack end-to-end:
- Frontend UI (React)
- Backend services (`user`, `client`, `transaction`)
- Log API contract served through LocalStack API Gateway -> Lambda (no dedicated log container)
- PostgreSQL and LocalStack infrastructure

Unlike mocked frontend tests in `services/frontend/crm-ui/e2e/`, these tests exercise real service integrations.

## Local Run (Recommended)

From the repository root:

```python
python scripts/pipelines/test_all.py
```
or

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
```

The script will:
1. Build backend artifacts.
2. Start `postgres` and `localstack`.
3. Package/deploy the log Lambda and provision a LocalStack HTTP API.
4. Start application containers and integration gateway.
5. Run HTTP smoke checks and this Playwright suite.
6. Tear down containers on exit.

## Runtime Snapshot (Latest Local Runs)

Measured on `2026-03-13`:

| Scope | Command | Observed runtime | Result |
|---|---|---:|---|
| Full local pipeline | `python scripts/pipelines/test_all.py` | `656.1s` (~10m 56s) | Failed in Layer 4 fullstack step |
| Fullstack integration only | `bash scripts/ci/run-fullstack-integration-e2e.sh` | `407s` (~6m 47s) | Passed |

Timing source logs:
- `build-logs/test-all/last-run-summary.md`
- `build-logs/fullstack-integration/20260313_224929-18799/docker-compose.log`

In CI, these runtimes usually increase because of colder caches and shared runners.

## Manual Test Run (Stack Already Running)

```bash
cd tests/integration
npm ci
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18088 npm test
```

Other commands:

```bash
npm run test:ui
npm run test:headed
npm run test:debug
npm run report
```

## Runtime Endpoints (CI/Script Topology)

- Integration gateway (Playwright base URL): `http://127.0.0.1:18088`
- User service: `http://127.0.0.1:18081`
- Client service: `http://127.0.0.1:18082`
- Transaction service: `http://127.0.0.1:18083`
- Frontend container: `http://127.0.0.1:18085`
- LocalStack: `http://127.0.0.1:14566`

Routing note:
- The frontend container runs with `FRONTEND_API_UPSTREAM=""` in this stack, so `/api/*` is intentionally owned by `integration-gateway` (`http://127.0.0.1:18088`).

## Test Credentials

- Admin: `admin@crm.local` / `admin123`
- User: `user@crm.local` / `UserPass123!`

The user account is created during the fullstack script warm-up step.

## CI Integration

Integration E2E runs via `scripts/ci/run-fullstack-integration-e2e.sh` from the reusable workflow:
- `.github/workflows/reusable-fullstack-integration.yml`

## Troubleshooting

### `ECONNREFUSED` or gateway health failures
- Ensure `run-fullstack-integration-e2e.sh` completed LocalStack/Lambda provisioning.
- Check `build-logs/fullstack-integration/docker-compose.log`.
- Confirm `http://127.0.0.1:18088/health` and `http://127.0.0.1:18088/api/v1/logs/health` respond.

### Authentication failures
- Verify credentials above.
- Re-run the fullstack script to reseed/warm up auth state.

### Slow or flaky runs
- Integration tests are sequential and slower than mocked tests.
- Ensure Docker has enough CPU/memory allocated.
