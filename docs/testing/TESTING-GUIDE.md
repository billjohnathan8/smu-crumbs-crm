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

## Fullstack Entry Points

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
bash scripts/ci/run-ingestion-verification-smoke.sh
```

## Output Locations

- Step logs: `build-logs/test-all/<timestamp>/`
- Latest summary (markdown): `build-logs/test-all/last-run-summary.md`
- Latest summary (json): `build-logs/test-all/last-run-summary.json`
- Frontend coverage: `services/frontend/crm-ui/coverage/index.html`

## Related Docs

- Onboarding: `docs/onboarding/new-dev-setup.md`
- LocalStack setup: `docs/infrastructure/localstack-setup.md`
