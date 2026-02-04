# ADR 0003: Route client audit events to an internal HTTP log-service with PostgreSQL persistence

- **Date:** 2026-02-04
- **Status:** Accepted
- **Deciders:** Team
- **Related:** `services/backend/log-service/app/main.py`, `services/backend/clients-service/src/main/java/com/itsa/crm/clients_service/logging/HttpClientAuditLogger.java`, `docs/api-contracts/openapi/log.yaml`

## Context
At BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`), log contracts described an SQS/Lambda model and client audit descriptions referenced SQS writes.

At HEAD, the repository implements a local, HTTP-accessible `log-service` that stores audit events in PostgreSQL and updates client-service integration to publish audit events to that HTTP endpoint.

### Evidence (Before vs After)
- **Before (BASE):**
  - `docs/api-contracts/openapi/log.yaml` - models SQS-triggered operations with no concrete HTTP paths.
  - `docs/api-contracts/openapi/client.yaml` - describes audit logging to SQS for create/update/delete.
- **After (HEAD):**
  - `services/backend/log-service/app/main.py` - implements `/api/v1/logs` and health endpoints via FastAPI.
  - `services/backend/log-service/app/repository.py` - persists log events to PostgreSQL.
  - `services/backend/log-service/app/migrations/V1__create_logs.sql` - defines `logs` table schema.
  - `services/backend/clients-service/src/main/java/com/itsa/crm/clients_service/logging/HttpClientAuditLogger.java` - sends audit events to log-service over HTTP.
  - `services/backend/clients-service/src/main/java/com/itsa/crm/clients_service/service/ClientServiceImpl.java` - keeps CRUD successful even if audit publishing fails (warn-level fallback).
  - `platform/k8s/apps/overlays/dev/client-service-patch.yaml` - injects `LOG_SERVICE_URL` for in-cluster service-to-service logging.

## Decision
Implement audit logging as HTTP calls from `client-service` to `log-service`, with `log-service` persisting events in PostgreSQL and running its own SQL migrations on startup.

## Alternatives Considered
- Keep SQS/Lambda semantics for local workflow - rejected because branch implementation is HTTP/Kubernetes-first for local execution.
- Persist audit data directly in `client-service` database - rejected to avoid coupling audit concerns with client domain persistence.
- Fail client CRUD when audit logging fails - rejected because availability of core CRUD is prioritized over strict audit delivery in this implementation.

## Consequences
### Positive
- Audit ingestion is directly testable through local HTTP and ingress.
- Logging concerns are separated into a dedicated service boundary.
- Shared PostgreSQL infrastructure can be reused for audit persistence in local cluster flow.

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
  - `services/backend/clients-service/src/main/java/com/itsa/crm/clients_service/logging/LogEventRequest.java`
  - `services/backend/log-service/app/schemas.py`
  - `docs/api-contracts/openapi/log.yaml`
- If delivery guarantees are later required, evaluate asynchronous retry/queue patterns as a follow-up ADR.
