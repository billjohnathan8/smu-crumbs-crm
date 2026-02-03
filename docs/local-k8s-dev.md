# Local Kubernetes Backend Development (kind)

This repository supports a local backend stack on a `kind` cluster without AWS and without RabbitMQ.

## Prerequisites
- Docker Desktop (or Docker Engine)
- kind
- kubectl
- Helm v3
- GNU Make
- curl

## One-command flow
Run from repository root:

```bash
make kind-up && make infra-up && make build-images && make kind-load && make deploy-dev && make smoke
```

## Successful Build/Deploy
A successful run via the `build-and-deploy-k8s-local` scripts means the full local Kubernetes flow completed and the infrastructure smoke checks passed.

Script entry points:
- `scripts/build-and-deploy/build-and-deploy-k8s-local.sh` (macOS/Linux)
- `scripts/build-and-deploy/build-and-deploy-k8s-local.ps1` (Windows PowerShell)
- `scripts/build-and-deploy-k8s-local.cmd` (Windows Command Prompt wrapper)

You can treat the run as successful when:
- The script exits with code `0`.
- You see all major stages complete (`infra-up`, `build-images`, `kind-load`, `deploy-dev`, `smoke`).
- Deployment rollout status succeeds for each service in `dev`.
- The smoke script reports `Smoke tests passed.`
- The script prints `Local Kubernetes build/deploy and smoke checks completed successfully.`

## What each target does
1. `make kind-up`
   - Creates kind cluster using `platform/k8s/infra/kind-config.yaml`.
2. `make infra-up`
   - Installs ingress-nginx, metrics-server, and PostgreSQL (Helm) for namespace `dev`.
3. `make build-images`
   - Builds `user-service:dev`, `client-service:dev`, and `log-service:dev` images.
4. `make kind-load`
   - Loads those images into kind.
5. `make deploy-dev`
   - Deploys the backend stack with Kustomize overlay `platform/k8s/apps/overlays/dev`.
6. `make smoke`
   - Runs the infrastructure smoke script `scripts/smoke-k8s-infra.sh`.
   - Validates that ingress routing, service startup, and database-backed request flow are working for the deployed `dev` stack.
   - Uses `http://localhost` first, then falls back to ingress port-forward if localhost routing is not stable on your machine.

## Infrastructure smoke script
- Script: `scripts/smoke-k8s-infra.sh`
- Intent: verify the local Kubernetes infrastructure and service wiring after deploy (not a full feature E2E suite).
- What it checks:
  - API health endpoints via ingress
  - End-to-end request path through the deployed services
  - Basic write/read/update/delete flow to confirm database path and service connectivity

## Adding More Services (Future)
When you add a new backend service, update these parts so local build/deploy keeps working:

1. Application + image
   - Add the service under `services/backend/<new-service>`.
   - Ensure it has a working Dockerfile and local build command.

2. Kubernetes base manifests
   - Add deployment and service YAMLs under `platform/k8s/apps/base`.
   - Register them in `platform/k8s/apps/base/kustomization.yaml`.

3. Dev overlay wiring
   - Add image tag mapping in `platform/k8s/apps/overlays/dev/kustomization.yaml`.
   - Add overlay patches (env vars, secrets, probes, etc.) if needed.
   - If externally reachable, add ingress path rules.

4. Build/load/deploy pipeline
   - Update `Makefile`:
     - `build-images` to build the new image.
     - `kind-load` to load the new image into kind.
     - `deploy-dev` rollout checks for the new deployment.

5. Infrastructure smoke coverage
   - Update `scripts/smoke-k8s-infra.sh` so it checks the new service health and main path.
   - Keep it infrastructure-focused (wiring/readiness), not deep feature E2E.

6. Validate
   - Re-run `build-and-deploy-k8s-local` script.
   - Confirm rollout and pod health:
     - `kubectl get deploy,pods -n dev`
   - Re-run smoke:
     - `make smoke`

## Manual quick checks
```bash
curl -i http://localhost/api/v1/users/health
curl -i http://localhost/api/v1/clients/health
curl -i http://localhost/api/v1/logs/health
```

## Ingress paths
- `http://localhost/api/v1/users` -> `user-service`
- `http://localhost/api/v1/clients` -> `client-service`
- `http://localhost/api/v1/logs` -> `log-service`

## Notes
- PostgreSQL is reachable in-cluster at `postgres-postgresql.dev.svc.cluster.local:5432`.
- Dev-only database credentials are defined in `platform/k8s/infra/helm-values/postgresql-values.yaml` and are not production credentials.
