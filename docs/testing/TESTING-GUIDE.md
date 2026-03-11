# Testing Guide

Run all commands from the repository root.
All commands in this guide are for local validation only; they do not change
or override GitHub Actions workflows.

## Quick Start

Full local suite (CI-main equivalent order):

```powershell
# Windows
python scripts/pipelines/test_all.py
```

```bash
# Linux/macOS/WSL
python3 scripts/pipelines/test_all.py
```

Useful local variants:

```bash
# Skip fullstack layer (for machines without bash/localstack/docker support)
python scripts/pipelines/test_all.py --skip-fullstack

# Fullstack smoke mode (same mode used on PRs)
python scripts/pipelines/test_all.py --fullstack-mode smoke

# Print all steps without executing them
python scripts/pipelines/test_all.py --dry-run
```

Split suites (wrappers around `test_all.py`):

```bash
# Backend only
python scripts/pipelines/test_backend.py

# Frontend only
python scripts/pipelines/test_frontend.py
```

If `python` is unavailable on your shell, use `python3`.

## Test Layers

The local `test_all.py` pipeline follows the same layer order as
`.github/workflows/ci-main.yml`:

1. Lint and static checks
2. Component/backend and frontend test suites
3. Frontend mocked E2E
4. Fullstack integration E2E (real containers + LocalStack + Playwright)

For the fullstack layer in `ci-main.yml`:
- Pull requests run `FULLSTACK_MODE=smoke` to reduce CI minutes.
- Pushes run `FULLSTACK_MODE=full`.

## Step Timing Output

`test_all.py` records duration for each executed command and prints a timing
table at the end of the run.

Outputs:
- Run logs per step: `build-logs/test-all/<timestamp>/*.log`
- Latest markdown summary: `build-logs/test-all/last-run-summary.md`
- Latest JSON summary: `build-logs/test-all/last-run-summary.json`

## Fullstack Integration E2E

Main entrypoint:

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
```

What this script validates:

1. Builds Java service artifacts and required images
2. Starts base infra (`localstack`, `postgres`)
3. Provisions log-service as LocalStack Lambda + HTTP API
4. Starts application services and integration gateway
5. Runs cross-service HTTP smoke assertions
6. Runs Playwright integration E2E against the live stack

Related workflow/config:
- Reusable workflow: `.github/workflows/reusable-fullstack-integration.yml`
- Called from: `.github/workflows/ci-main.yml` and `.github/workflows/ci-integration.yml`
- Workflow timeouts: `35` minutes (test step), `50` minutes (job)

## Expected Runtime and CI Minutes

Guideline baseline from the latest successful local `test_all.py` run in full mode
(March 11, 2026), from:
- `build-logs/test-all/last-run-summary.md`
- `build-logs/test-all/last-run-summary.json`

| Pipeline Layer | Time |
|---|---:|
| Layer 1 - Lint / Format / Typecheck | 135.2s (~2.3 min) |
| Layer 2 - Unit / Component Tests | 127.1s (~2.1 min) |
| Layer 3 - Frontend Mocked E2E | 90.4s (~1.5 min) |
| Layer 4 - Fullstack Integration E2E | 171.1s (~2.9 min) |
| **Total (`test_all.py`, full mode)** | **523.8s (~8.7 min)** |

Planning expectations for GitHub Actions:
- Fullstack integration in CI is usually slower than local due to runner startup and
  environment variability.
- PRs run `FULLSTACK_MODE=smoke`; pushes run `FULLSTACK_MODE=full`.
- Timeout limits are safety ceilings, not expected runtime (`35` minutes for the
  fullstack test step and `50` minutes for the reusable workflow job).

Operational note:
- Transient readiness polling errors like `curl: (56) Recv failure: Connection reset by peer` can appear during startup and can be non-fatal if later `[ready]` checks succeed.

## Reports and Artifacts

Local outputs:
- Aggregated timing summary (markdown): `build-logs/test-all/last-run-summary.md`
- Aggregated timing summary (JSON): `build-logs/test-all/last-run-summary.json`
- Per-step logs: `build-logs/test-all/<timestamp>/*.log`
- Frontend coverage: `services/frontend/crm-ui/coverage/index.html`

Fullstack failure artifacts in GitHub Actions:
- `build-logs/fullstack-integration/**`
- `tests/integration/test-results/**`
- `tests/integration/playwright-report/**`

## Related Docs

- LocalStack + CI integration details: `docs/infrastructure/localstack-setup.md`
- Dev environment setup: `docs/onboarding/new-dev-setup.md`
