# ADR 0005: Align OpenAPI contracts with active local HTTP interfaces

- Date: 2026-02-04
- Status: Accepted

## Context

API docs had drift risk when specs described speculative or outdated paths.

## Decision

OpenAPI files in `docs/api-contracts/openapi/` must track the active, callable HTTP interfaces implemented by current services.

## Consequences

Positive:
- Contracts are reliable for integration and testing.
- Reviewers can validate API changes quickly.

Tradeoffs:
- Every endpoint change requires spec updates in the same PR.

## Implementation Rule

When API behavior changes, update both implementation and OpenAPI contracts together.
