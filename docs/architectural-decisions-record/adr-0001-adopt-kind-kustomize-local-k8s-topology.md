# ADR 0001: Adopt kind + Kustomize overlays for local backend Kubernetes topology

- **Date:** 2026-02-04
- **Status:** Accepted
- **Deciders:** Team
- **Related:** `docs/local-k8s-dev.md`, `platform/k8s/apps/base/kustomization.yaml`, `platform/k8s/apps/overlays/dev/kustomization.yaml`

## Context
From BASE (`bd5f10dd9036bc8899f8d6bb4dfb48f32f930a2f`) to HEAD, the repository gained concrete Kubernetes manifests and environment overlays for backend services. Before these commits, the repo documented target stack ideas but did not contain committed app manifests for a local cluster.

The branch introduces:
- A base manifest set for namespace, deployments, services, and ingress.
- A `dev` overlay for image tags, labels, and deployment patches.
- A kind cluster config that maps host ports for local ingress access.

### Evidence (Before vs After)
- **Before (BASE):**
  - `docs/main-diagrams/tech-stack.md` - documents expected platform directories but not concrete manifests.
  - `platform/k8s/apps/base/kustomization.yaml` - absent at BASE, proving app-level Kustomize resources were not yet committed.
- **After (HEAD):**
  - `platform/k8s/apps/base/kustomization.yaml` - defines the base resource composition for backend services.
  - `platform/k8s/apps/overlays/dev/kustomization.yaml` - defines dev overlay image tags, labels, and patches.
  - `platform/k8s/apps/base/ingress.yaml` - defines path-based ingress routing on `localhost`.
  - `platform/k8s/infra/kind-config.yaml` - defines local kind cluster topology and host port mappings.

## Decision
Use a Kubernetes-first local topology with:
- **kind** for the local cluster.
- **Kustomize base + `dev` overlay** under `platform/k8s/apps`.
- **Ingress path routing** on `localhost` for `agent-service`, `client-service`, and `log-service`.

## Alternatives Considered
- Keep per-environment raw manifests without overlays - rejected due to duplication and harder drift control.
- Use Docker Compose as the primary local topology - rejected because it diverges from the Kubernetes deployment model used in platform docs.
- Keep manifests only as documentation examples - rejected because branch scope requires runnable local infra.

## Consequences
### Positive
- A concrete, versioned Kubernetes app topology is now committed and reproducible.
- Service routing and namespace boundaries are explicit in manifests.
- Dev-specific settings can be patched without changing base resources.

### Negative / Risks
- Manifest sprawl can increase as more services/environments are added.
- Overlay drift can appear if base and overlays are not maintained together.
- Local kind behavior may still differ from non-local clusters.

### Mitigations
- Keep base resources minimal and push environment specifics into overlays.
- Require changes to base + overlays together during service onboarding.
- Keep local routing and health checks covered by smoke verification scripts.

## Implementation Notes
- Add new services by extending `platform/k8s/apps/base` and registering resources in `platform/k8s/apps/base/kustomization.yaml`.
- Add environment-specific wiring in `platform/k8s/apps/overlays/dev`.
- Keep ingress paths consistent with service controller routes and OpenAPI contracts.
