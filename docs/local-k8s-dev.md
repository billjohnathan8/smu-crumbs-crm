# Local Kubernetes Backend Development (kind)

This is the canonical runbook for the local backend Kubernetes flow in this repository.

The local flow does not require AWS resources. AWS-oriented architecture docs still exist separately (for target-state planning).

## Scope and canonical paths
- Cluster config: `platform/k8s/infra/kind-config.yaml`
- Infra Helm values: `platform/k8s/infra/helm-values/*.yaml`
- App manifests: `platform/k8s/apps/base`
- Active local overlay: `platform/k8s/apps/overlays/dev`
- Namespace: `dev`
- Default kind cluster name in config: `cs301-crm`

Do not use `platform/k8s/apps/dev/*.yaml` (deprecated pointer files).

## Prerequisites
- Docker Desktop (or Docker Engine) running
- kind
- kubectl
- Helm v3
- GNU Make
- Bash and curl
- Java 21 (recommended for Gradle wrapper builds)

Windows notes:
- Use the PowerShell or `.cmd` wrappers in `scripts/`.
- Install Git for Windows (Git Bash) so Makefile recipes can run under Bash.

## Golden path (recommended)
Run one of these from repository root:

```powershell
.\scripts\build-and-deploy\build-and-deploy-k8s-local.ps1
```

```cmd
.\scripts\build-and-deploy-k8s-local.cmd
```

```bash
bash ./scripts/build-and-deploy/build-and-deploy-k8s-local.sh
```

Success criteria:
- Exit code `0`
- Rollout checks pass for `user-service`, `client-service`, `log-service`
- Smoke output includes `Smoke tests passed.`
- Wrapper output ends with `Local Kubernetes build/deploy and smoke checks completed successfully.`

## Step-by-step flow (manual)

### 0) (Recommended) Run backend build/tests first
```powershell
.\scripts\build-and-test\build-and-test-backend.ps1
```
```cmd
.\scripts\build-and-test-backend.cmd
```
```bash
bash ./scripts/build-and-test/build-and-test-backend.sh
```

The backend script now runs each service-local pipeline (lint, build, tests, coverage reports):
- `services/backend/user-service`: `gradlew localTestPipeline`
- `services/backend/clients-service`: `gradlew localTestPipeline`
- `services/backend/log-service`: `python run-local-test-pipeline.py`

### 1) Create and verify kind cluster
```bash
make kind-up
kind get clusters
kubectl config use-context kind-cs301-crm
kubectl cluster-info
```

If `make kind-up` fails because the cluster already exists, skip to context verification or use the wrapper script (it handles existing clusters automatically).

### 2) Install ingress + infra dependencies
```bash
make infra-up
kubectl get pods -n ingress-nginx
kubectl get pods -n dev
```

`make infra-up` installs:
- `ingress-nginx` in namespace `ingress-nginx`
- `metrics-server` in namespace `kube-system`
- `postgres` (Bitnami chart) in namespace `dev`

### 3) Build backend images
```bash
make build-images
```

Builds:
- `user-service:dev`
- `client-service:dev`
- `log-service:dev`

### 4) Load images into kind
```bash
make kind-load
```

### 5) Deploy dev overlay
```bash
make deploy-dev
```

Equivalent raw apply:
```bash
kubectl apply -k platform/k8s/apps/overlays/dev
```

### 6) Verify workloads and ingress routes
```bash
kubectl get deploy,pods,svc,ing -n dev
curl -i http://localhost/api/v1/users/health
curl -i http://localhost/api/v1/clients/health
curl -i http://localhost/api/v1/logs/health
```

Ingress routes:
- `http://localhost/api/v1/users` -> `user-service`
- `http://localhost/api/v1/clients` -> `client-service`
- `http://localhost/api/v1/logs` -> `log-service`

### 7) Run infrastructure smoke tests
```bash
make smoke
```

Smoke script: `scripts/smoke-k8s-infra.sh`

Checks:
- Health endpoints through ingress
- Create/read/update/delete path for clients
- Direct log event ingestion into `log-service`

The script first tries `http://localhost`, then falls back to ingress controller port-forward if needed.

## Teardown and reset

### Full reset (recommended when things are badly drifted)
```bash
kind delete cluster --name cs301-crm
```

### App-only reset (keep cluster)
```bash
kubectl delete -k platform/k8s/apps/overlays/dev --ignore-not-found
helm uninstall postgres -n dev
helm uninstall ingress-nginx -n ingress-nginx
helm uninstall metrics-server -n kube-system
```

## Common failure modes and debug commands

### `make kind-up` fails because cluster already exists
- Verify: `kind get clusters`
- Recreate cleanly: `kind delete cluster --name cs301-crm` then rerun deploy wrapper

### Ingress endpoint on `localhost` is unreachable
- Check ingress controller: `kubectl get pods -n ingress-nginx`
- Check ingress object: `kubectl describe ingress backend-ingress -n dev`
- Run smoke anyway (it includes port-forward fallback): `make smoke`

### Pods stay `ImagePullBackOff` or old image keeps running
- Confirm images loaded: rerun `make kind-load`
- Restart and verify rollout:
  - `kubectl rollout restart deployment/user-service -n dev`
  - `kubectl rollout restart deployment/client-service -n dev`
  - `kubectl rollout restart deployment/log-service -n dev`
  - `kubectl rollout status deployment/user-service -n dev --timeout=180s`

### Pods fail readiness/liveness due to startup or DB issues
- Inspect logs:
  - `kubectl logs deployment/user-service -n dev --tail=100`
  - `kubectl logs deployment/client-service -n dev --tail=100`
  - `kubectl logs deployment/log-service -n dev --tail=100`
  - `kubectl logs statefulset/postgres-postgresql -n dev --tail=100`
- Inspect events: `kubectl get events -n dev --sort-by=.metadata.creationTimestamp`

### Windows wrapper fails because Bash or Make is missing
- Install/verify Git Bash and Make in `PATH`
- Re-run:
  - `.\scripts\build-and-deploy\build-and-deploy-k8s-local.ps1`

## Service onboarding checklist (for this local flow)
When adding a new backend service:
- Add service code and Dockerfile under `services/backend/<new-service>`
- Add base deployment/service YAML under `platform/k8s/apps/base` and register in `platform/k8s/apps/base/kustomization.yaml`
- Add image tag entry and patches in `platform/k8s/apps/overlays/dev/kustomization.yaml`
- Add ingress rule if externally reachable
- Extend `Makefile` targets: `build-images`, `kind-load`, `deploy-dev`
- Extend `scripts/smoke-k8s-infra.sh` with infrastructure-level checks for the new service
