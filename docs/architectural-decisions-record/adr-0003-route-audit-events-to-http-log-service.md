# ADR 0003: Route client audit events to an internal HTTP log-service with PostgreSQL persistence

- **Date:** 2026-02-04
- **Status:** Superseded (2026-03-11 by ADR 0007)
- **Deciders:** Team
- **Related:** `services/backend/log/app/main.py`, `services/backend/client/src/main/java/com/scroogebank/crm/client_service/logging/HttpClientAuditLogger.java`, `docs/api-contracts/openapi/log.yaml`

## Context
At BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`), log contracts described an SQS/Lambda model and client audit descriptions referenced SQS writes.

At the time this ADR was accepted, the branch implemented a direct HTTP `log-service` integration that stores audit events in PostgreSQL and updated client-service integration to publish audit events to that HTTP endpoint.

This ADR remains the source decision for the HTTP contract and persistence model, but its local/CI runtime assumptions are superseded by ADR 0007. The repository keeps the same HTTP contract and routes it through Lambda-compatible execution in LocalStack instead of a dedicated log HTTP container in integration environments.

### Evidence (Before vs After)
- **Before (BASE):**
  - `docs/api-contracts/openapi/log.yaml` - models SQS-triggered operations with no concrete HTTP paths.
  - `docs/api-contracts/openapi/client.yaml` - describes audit logging to SQS for create/update/delete.
- **After (HEAD):**
  - `services/backend/log/app/main.py` - implements `/api/logs` and health endpoints via FastAPI.
  - `services/backend/log/app/repository.py` - persists log events to PostgreSQL.
  - `services/backend/log/app/migrations/V2__create_audit_logs_and_communications.sql` - defines audit and communications schema.
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/logging/HttpClientAuditLogger.java` - sends audit events to log-service over HTTP.
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/service/ClientServiceImpl.java` - keeps CRUD successful even if audit publishing fails (warn-level fallback).
  - `platform/k8s/apps/overlays/dev/client-service-patch.yaml` - injects `LOG_SERVICE_URL` for in-cluster service-to-service logging.

## Decision
Implement audit logging as HTTP calls from `client-service` to `log-service`, with `log-service` persisting events in PostgreSQL and running its own SQL migrations on startup.

## Alternatives Considered
- Keep SQS/Lambda semantics for local workflow - rejected at the time because the branch implementation was HTTP/Kubernetes-first for local execution.
- Persist audit data directly in `client-service` database - rejected to avoid coupling audit concerns with client domain persistence.
- Fail client CRUD when audit logging fails - rejected because availability of core CRUD is prioritized over strict audit delivery in this implementation.

## Consequences
### Positive
- Audit ingestion is directly testable through local HTTP interfaces.
- Logging concerns are separated into a dedicated service boundary.
- Shared PostgreSQL infrastructure can be reused for audit persistence.

### Negative / Risks
- Synchronous HTTP logging introduces runtime dependency from `client-service` to `log-service`.
- Best-effort error handling can drop audit events during log-service outages.
- Database schema/migration ownership now exists in multiple services.

### Mitigations
- Keep health endpoints and smoke checks for `log-service` in deployment validation.
- Capture failed publish attempts in `client-service` logs for operational visibility.
- Keep migration scripts versioned and checked in per service.

## Implementation Notes
- Maintain request schema alignment between:
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/logging/LogEventRequest.java`
  - `services/backend/log/app/schemas.py`
  - `docs/api-contracts/openapi/log.yaml`
- If delivery guarantees are later required, evaluate asynchronous retry/queue patterns as a follow-up ADR.
