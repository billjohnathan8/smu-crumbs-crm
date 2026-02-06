# ADR 0002: Standardize local Kubernetes deployment workflow with Make and smoke checks

- **Date:** 2026-02-04
- **Status:** Accepted
- **Deciders:** Team
- **Related:** `Makefile`, `scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh`, `scripts/smoke-k8s-infra/smoke-k8s-infra.sh`, `docs/local-k8s-dev.md`

## Context
From BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`) to HEAD, local cluster deployment moved from ad-hoc/manual expectations to a scripted, repeatable workflow.

The branch adds:
- A root `Makefile` with named deployment stages.
- Cross-platform wrapper scripts for build/deploy orchestration.
- An infrastructure smoke script that validates routing and core request paths after deployment.
- Documentation that defines success criteria for the full flow.

### Evidence (Before vs After)
- **Before (BASE):**
  - `Makefile` - absent at BASE, proving no centralized make-driven workflow.
  - `README.md` - no local Kubernetes build/deploy runbook was documented.
- **After (HEAD):**
  - `Makefile` - defines `kind-up`, `infra-up`, `build-images`, `kind-load`, `deploy-dev`, and `smoke`.
  - `scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh` - orchestrates make targets with kind context handling.
  - `scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.ps1` - Windows PowerShell equivalent orchestration.
  - `scripts/smoke-k8s-infra/smoke-k8s-infra.sh` - verifies health endpoints and core CRUD + log ingestion path through ingress.
  - `docs/local-k8s-dev.md` - documents one-command flow and success criteria.

## Decision
Use a staged `make` pipeline as the canonical local deployment workflow, with OS-specific wrappers and a required post-deploy smoke test.

## Alternatives Considered
- Keep manual `kubectl`/`helm` command sequences - rejected due to poor repeatability and high onboarding friction.
- Maintain separate per-OS flows without shared targets - rejected because logic would drift and become harder to maintain.
- Validate only rollout status without functional smoke checks - rejected because routing/data-path failures can pass rollout checks.

## Consequences
### Positive
- Local deployment flow becomes deterministic and easier to run across machines.
- Stage boundaries (`infra-up`, `deploy-dev`, `smoke`) improve troubleshooting.
- Smoke checks catch infrastructure wiring regressions early.

### Negative / Risks
- Scripts and Make targets require ongoing maintenance as services evolve.
- The smoke script can fail from host-local ingress differences (e.g., localhost mapping behavior).
- Tooling prerequisites (`kind`, `helm`, `kubectl`, `docker`, `make`) remain a setup dependency.

### Mitigations
- Keep wrappers thin and delegate core behavior to `Makefile` targets.
- Maintain the smoke script fallback path (`kubectl port-forward`) for ingress instability.
- Keep prerequisites and runbook centralized in `docs/local-k8s-dev.md`.

## Implementation Notes
- Add any new deploy stage as a Make target first, then call it from wrappers.
- When onboarding a new service, update both deployment targets and smoke coverage.
- Preserve command parity between `.sh`, `.ps1`, and `.cmd` entry points.
