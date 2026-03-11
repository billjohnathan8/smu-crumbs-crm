# Architectural Decision Records

These ADRs were reconstructed from the diff between:
- **BASE:** `bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f` (merge-base with `origin/main`)
- **HEAD:** current branch `feature/k8s-backend-integration`

Each ADR was validated against the repository state at HEAD and, where needed, against BASE to confirm "before vs after" evidence.

## ADR Index

- [ADR 0001 - Adopt kind + Kustomize overlays for local backend Kubernetes topology](adr-0001-adopt-kind-kustomize-local-k8s-topology.md)  
  Defines the committed local Kubernetes app topology with base + `dev` overlays and ingress routing.

- [ADR 0002 - Standardize local Kubernetes deployment workflow with Make and smoke checks](adr-0002-standardize-local-k8s-deploy-workflow.md)  
  Establishes repeatable make-driven deploy stages plus post-deploy infrastructure smoke verification.

- [ADR 0003 - Route client audit events to an internal HTTP log-service with PostgreSQL persistence](adr-0003-route-audit-events-to-http-log-service.md)  
  Historical decision for HTTP log ingestion; later superseded by ADR 0007 for local/CI runtime topology.

- [ADR 0004 - Adopt runtime-discovery local CI for polyglot backend services under `services/backend`](adr-0004-adopt-polyglot-backend-local-ci-discovery.md)  
  Uses one local CI runner for mixed Gradle and Python backend services with Docker health checks.

- [ADR 0005 - Align OpenAPI contracts with active local HTTP interfaces](adr-0005-align-openapi-with-active-local-http-interfaces.md)  
  Keeps API contracts aligned with currently implemented and routed local HTTP endpoints.

- [ADR 0007 - Adopt Lambda-only log-service runtime in local and CI integration topology](adr-0007-adopt-lambda-only-log-service-runtime-in-local-and-ci.md)  
  Removes dedicated log container from fullstack integration and provisions log runtime through Lambda + LocalStack HTTP API.
