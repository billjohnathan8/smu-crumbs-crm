# ADR 0004: Adopt runtime-discovery local CI for polyglot backend services under `services/backend`

- **Date:** 2026-02-04
- **Status:** Accepted
- **Deciders:** Team
- **Related:** `scripts/build-and-test/build-and-test-backend.sh`, `scripts/build-and-test/build-and-test-backend.ps1`, `services/backend`

## Context
From BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`) to HEAD, backend services were introduced under a shared `services/backend` root and include both Java/Gradle and Python stacks.

The branch also adds local CI scripts that discover backend services by runtime and apply runtime-specific build/test steps plus Docker health checks.

### Evidence (Before vs After)
- **Before (BASE):**
  - `services/backend` - absent at BASE, proving no committed backend service root in this compare range.
  - `scripts/build-and-test/build-and-test-backend.sh` - absent at BASE, proving no unified local backend CI runner.
- **After (HEAD):**
  - `scripts/build-and-test/build-and-test-backend.sh` - discovers services and selects `gradle` vs `python` workflows.
  - `scripts/build-and-test/build-and-test-backend.ps1` - implements equivalent runtime-aware workflow on Windows.
  - `services/backend/clients-service/gradlew` - proves Gradle-based backend runtime.
  - `services/backend/log-service/requirements.txt` - proves Python-based backend runtime.
  - `README.md` - documents local CI entry points for this unified script model.

## Decision
Treat `services/backend` as the backend service root and run local CI through runtime-discovery scripts that:
- detect service type by repository conventions,
- run language-appropriate build and unit tests,
- perform Docker run/health verification per service.

## Alternatives Considered
- Hardcode each service in scripts - rejected due to maintenance overhead as services are added.
- Keep separate independent scripts per language/service - rejected due to inconsistent execution and reporting.
- Skip Docker runtime validation in local CI - rejected because startup/runtime issues can pass compile/unit phases.

## Consequences
### Positive
- New services can be onboarded with less script churn when they follow detection conventions.
- One local command validates mixed-language backend services.
- Docker health checks improve confidence beyond pure unit tests.

### Negative / Risks
- Runtime detection is convention-dependent and can miss non-standard layouts.
- Docker-heavy checks increase local execution time and machine requirements.
- Runtime parity across OS/shell environments can still drift.

### Mitigations
- Document required service conventions (runtime files, Dockerfile, tests).
- Keep Linux and Windows script logic aligned and review together.
- Fail fast with explicit errors when service detection or prerequisites are missing.

## Implementation Notes
- Service onboarding checklist:
  - Place service under `services/backend/<service-name>`.
  - Include either Gradle wrapper or Python requirements/tests as detection signals.
  - Include a Dockerfile and a reachable health endpoint.
- Keep `.gitignore` rules aligned with local CI artifacts (`.gradle-user-home`, Python virtual envs, caches).
