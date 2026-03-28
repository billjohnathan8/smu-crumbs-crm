# Coding Standards

This document is intentionally short. Use it as the minimum bar for all PRs.

## Core Rules

- Keep changes small and focused.
- Prefer clarity over cleverness.
- Do not commit secrets, generated binaries, or machine-local configs.
- Update tests and docs in the same PR when behavior changes.

## Git and PR Workflow

- Branch naming: `feature/*`, `fix/*`, `docs/*`, `refactor/*`, `test/*`, `chore/*`.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Rebase/sync with `main` before opening PR.
- Keep PR description explicit: scope, risk, test evidence, rollback plan.

## Review Expectations

- Every non-trivial change gets reviewed.
- Review for correctness first, then maintainability, then style.
- Raise regressions and missing tests before merge.

## Language Standards

### Java (Spring Boot)

- Follow Checkstyle/Gradle rules enforced in CI.
- Keep controllers thin; move business logic to services.
- Prefer constructor injection.
- Write unit tests for service and validation logic.

### Python

- Format with `black`; lint with `flake8`.
- Keep modules small and typed where practical.
- Avoid hidden side effects at import time.

### TypeScript/React

- Use strict, explicit types for API-facing data.
- Keep pages/components focused; extract reusable hooks/helpers.
- Use ESLint and Prettier outputs as source of truth.
- Format with Prettier before committing: `cd services/frontend/crm-ui && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"`

### Terraform

- Run `terraform fmt -recursive` and `terraform validate` before PR.
- Keep variables and outputs documented.
- Avoid hardcoding environment-specific secrets or IDs.

## Testing Minimum

Before opening PR, run:

```bash
python scripts/pipelines/test_all.py
```

Common shortcuts:

```bash
python scripts/pipelines/test_backend.py
python scripts/pipelines/test_frontend.py
python scripts/pipelines/test_terraform.py
python scripts/pipelines/test_all.py --skip-fullstack
```

Use `python3` where required.

## Documentation Minimum

Update docs when you change:
- setup steps,
- runtime topology,
- API contracts,
- test workflow.

If a doc no longer reflects reality, remove or rewrite it in the same PR.
