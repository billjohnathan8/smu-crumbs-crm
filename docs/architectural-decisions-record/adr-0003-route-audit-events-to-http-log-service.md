# ADR 0003: Route client audit events to an internal HTTP log-service with PostgreSQL persistence

- Date: 2026-02-04
- Status: Superseded in runtime topology by ADR 0007

## Context

The project moved audit logging to an explicit HTTP API (`/api/logs`) backed by PostgreSQL.

## Decision

Client-facing business services publish audit events to the log service over HTTP. The log service persists those events in PostgreSQL.

## Consequences

Positive:
- Clear contract for audit ingestion.
- Easier end-to-end testing through HTTP interfaces.

Tradeoffs:
- Runtime dependency exists between calling services and log API.
- Best-effort logging can drop events during outages.

## Current Status

The HTTP contract remains active.
Local/CI runtime execution details are now defined by ADR 0007 (Lambda-backed log runtime).
