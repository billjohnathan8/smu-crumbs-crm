# ADR 0005: Align OpenAPI contracts with active local HTTP interfaces

- **Date:** 2026-02-04
- **Status:** Accepted
- **Deciders:** Team
- **Related:** `docs/api-contracts/openapi/agent.yaml`, `docs/api-contracts/openapi/log.yaml`, `docs/api-contracts/openapi/client.yaml`

## Context
At BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`), OpenAPI specs for `agent` and `log` contained unresolved deployment ambiguity (`TODO`, Lambda/SQS-oriented surfaces). Across the branch commits, service implementations and local ingress routes became concrete HTTP interfaces.

To reduce drift between contract and implementation, the specs were revised to describe the active local HTTP routes and payloads.

### Evidence (Before vs After)
- **Before (BASE):**
  - `docs/api-contracts/openapi/agent.yaml` - mixes Lambda operation modeling and TODO deployment notes.
  - `docs/api-contracts/openapi/log.yaml` - defines SQS-triggered model with no concrete HTTP API paths.
- **After (HEAD):**
  - `docs/api-contracts/openapi/agent.yaml` - documents concrete `/api/v1/agents` and health endpoints.
  - `docs/api-contracts/openapi/log.yaml` - documents `/api/v1/logs` and health endpoints.
  - `docs/api-contracts/openapi/client.yaml` - updates audit logging descriptions from SQS to HTTP log-service calls.
  - `services/backend/agent/src/main/java/com/scroogebank/crm/agentservice/controller/UserController.java` - implements documented user endpoints.
  - `services/backend/log/app/main.py` - implements documented log endpoints.

## Decision
Use OpenAPI files in `docs/api-contracts/openapi` as implementation-aligned contracts for the currently active local HTTP services and update them whenever endpoint behavior changes.

## Alternatives Considered
- Keep speculative multi-runtime/multi-deployment descriptions in one spec - rejected because it obscures what is actually deployed.
- Maintain separate "draft" contracts without implementation alignment - rejected due to high drift risk.
- Rely on code-only API discovery - rejected because explicit contracts are required for cross-team integration and review.

## Consequences
### Positive
- Contracts now reflect callable local endpoints and payloads.
- Integration and smoke checks can reference one clear contract surface.
- Team onboarding improves because ambiguous TODO states are reduced.

### Negative / Risks
- Contract updates can lag if implementation changes are merged without doc changes.
- Simplified current contracts may omit future deployment variants.

### Mitigations
- Keep OpenAPI updates in the same PR/commit set as endpoint changes.
- Validate specs in review using existing coding standards guidance.
- Record future deployment-specific variants in follow-up ADRs when needed.

## Implementation Notes
- Keep these artifacts in sync during endpoint changes:
  - OpenAPI spec in `docs/api-contracts/openapi/<service>.yaml`
  - Controller/router implementation
  - Ingress route and smoke script coverage when route paths change
- For new services, add contract files first, then wire endpoints and local routing.
