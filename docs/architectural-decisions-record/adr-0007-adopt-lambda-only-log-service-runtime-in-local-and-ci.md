# ADR 0007: Adopt Lambda-only log-service runtime in local and CI integration topology

- Date: 2026-03-11
- Status: Accepted
- Supersedes: runtime topology portion of ADR 0003

## Context

The log API contract is HTTP, but running both a dedicated log container and Lambda path increased local/CI complexity.

## Decision

Use Lambda as the canonical log-service runtime for local/CI integration:
- No dedicated log-service container in integration topology.
- Provision log Lambda + LocalStack HTTP API during test runtime.
- Keep gateway routes pointing to that API surface.

## Consequences

Positive:
- One runtime model across integration and infrastructure intent.
- Fewer long-running containers in fullstack tests.

Tradeoffs:
- Local/CI now depends on LocalStack provisioning reliability.

## Operational Guardrails

- Keep readiness checks for LocalStack, Lambda, and `/api/v1/logs/health`.
- Keep deterministic setup in `scripts/ci/run-fullstack-integration-e2e.sh`.
