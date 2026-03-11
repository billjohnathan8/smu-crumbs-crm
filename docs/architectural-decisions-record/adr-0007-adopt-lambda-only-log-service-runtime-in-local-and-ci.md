# ADR 0007: Adopt Lambda-only log-service runtime in local and CI integration topology

- **Date:** 2026-03-11
- **Status:** Accepted
- **Deciders:** Team
- **Supersedes:** ADR 0003 (runtime topology portion)
- **Related:** `scripts/ci/fullstack-integration.compose.yml`, `scripts/ci/fullstack-gateway.nginx.conf`, `scripts/ci/run-fullstack-integration-e2e.sh`, `services/backend/log/lambda_function.py`

## Context
The log API contract remains HTTP (`/api/logs`, AML, communications), but fullstack integration topology still carried a dedicated `log-service` container. This created duplication with the Lambda runtime path already used in infrastructure and increased local/CI orchestration complexity.

## Decision
Use Lambda as the canonical runtime for log-service in local/CI integration topology:
- Remove the dedicated `log-service` container from CI compose topology.
- Provision the log Lambda and LocalStack HTTP API at test runtime.
- Route gateway log paths to the LocalStack API endpoint.
- Keep client-service audit publishing best-effort and HTTP contract-compatible.

## Consequences
### Positive
- One canonical runtime model across local/CI and infrastructure intent.
- Fewer long-running containers in fullstack integration.
- Smoke tests validate the same Lambda-compatible invocation path used by deployed infrastructure.

### Negative / Risks
- Fullstack integration now depends on LocalStack API Gateway/Lambda provisioning steps.
- Test startup can fail due to packaging/provisioning issues unrelated to Java services.

### Mitigations
- Explicit readiness checks for LocalStack, Lambda, and log health routes.
- Deterministic provisioning script (`run-fullstack-integration-e2e.sh`) with clear failure points.
- Keep audit publishing best-effort so CRUD business paths remain available if logging fails.
