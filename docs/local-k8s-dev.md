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

Do not use `platform/k8s-apps/*` (deprecated legacy path; removed).

## Prerequisites
- Docker Desktop (or Docker Engine) running
- kind
- kubectl
- Helm v3
- GNU Make
- Bash and curl
- OpenSSL (for smoke tests on macOS/Linux)
- Java 21 (recommended for Gradle wrapper builds)
- **Python 3.7+** (optional, for HTML probe diagnostics reports)

Windows notes:
- Use the PowerShell or `.cmd` wrappers in `scripts/`.
- Install Git for Windows (Git Bash) so Makefile recipes can run under Bash.
- Python is optional but recommended for enhanced probe diagnostics. Install from [python.org](https://www.python.org/downloads/) or via `winget install Python.Python.3.12`

## Golden path (recommended)
Run one of these from repository root:

```powershell
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

```cmd
.\scripts\build-and-deploy-k8s-local.cmd
```

```bash
bash ./scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh
```

Notes:
- The wrapper runs the full make-driven deploy plus smoke checks.
- On success, it tears down dev workloads and deletes the kind cluster. Use the manual steps below if you want a persistent cluster for debugging.

Success criteria:
- Exit code `0`
- Rollout checks pass for `agent`, `client`, `log`, `transaction`
- Smoke output includes `Smoke tests passed.`
- Wrapper output ends with `Local Kubernetes build/deploy and smoke checks completed successfully.`

## One-command test + deploy
Run full test pipeline (backend + frontend), then deploy to local k8s only if tests pass:

```powershell
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1
```

```cmd
.\scripts\test-and-spinup-all.cmd
```

```bash
bash ./scripts/test-and-spinup-all/test-and-spinup-all.sh
```

Notes:
- Runs the full test pipeline (backend + frontend) with coverage reports.
- Logs are captured under `build-logs/build-and-test-all`, `build-logs/build-and-deploy-k8s`, and `build-logs/test-and-spinup-all`.
- The deploy phase uses the same teardown behavior as the deploy-only wrapper (cluster is deleted on success).

## Step-by-step flow (manual)

### 0) (Recommended) Run backend build/tests first
```powershell
.\scripts\build-and-test-backend\build-and-test-backend.ps1
```
```cmd
.\scripts\build-and-test-backend.cmd
```
```bash
bash ./scripts/build-and-test-backend/build-and-test-backend.sh
```

The backend script now runs each service-local pipeline (lint, build, tests, coverage reports):
- `services/backend/agent`: `gradlew localTestPipeline`
- `services/backend/client`: `gradlew localTestPipeline`
- `services/backend/transaction`: `gradlew localTestPipeline`
- `services/backend/log`: `python run-local-test-pipeline.py`

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
- `agent:dev`
- `client:dev`
- `log:dev`
- `transaction:dev`

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
curl -i http://localhost/health
```

Ingress routes:
- `http://localhost/api/agents` -> `agent-service`
- `http://localhost/api/clients` -> `client-service`
- `http://localhost/api/logs` -> `log-service`
- `http://localhost/api/transactions` -> `transaction-service`

### 7) Run smoke tests
```bash
make smoke
```

The `smoke` target runs two test suites in sequence:
1. **Infrastructure smoke** (`make smoke-infra`) — HTTP endpoints, CRUD operations, service integration
2. **Probe-aware smoke** (`make smoke-probes`) — Kubernetes health probes, rollout status, pod readiness

#### Infrastructure Smoke

Scripts:
- Windows: `scripts/smoke-k8s-infra/smoke-k8s-infra.ps1`
- macOS/Linux: `scripts/smoke-k8s-infra/smoke-k8s-infra.sh`

Optional environment variables:
- `BASE_URL` (default: `http://localhost`)
- `JWT_HMAC_SECRET` (default: `dev-only-insecure-secret`)

Checks:
- Health endpoints through ingress
- Create/read/update/delete path for clients
- Direct log event ingestion into `log-service`
- Transactions list endpoint (if `transaction-service` is deployed)

The script first tries `http://localhost`, then falls back to ingress controller port-forward if needed.

#### Probe-Aware Smoke

Scripts:
- Windows: `scripts/smoke-k8s-infra/smoke-probes.ps1`
- macOS/Linux: `scripts/smoke-k8s-infra/smoke-probes.sh`

Validates:
1. **Rollout readiness** — Gates on `kubectl rollout status` for all Deployments and StatefulSets in the namespace (default: `dev`)
2. **Probe presence** — Asserts every container has:
   - `readinessProbe` (required)
   - `livenessProbe` (required)
   - `startupProbe` (required for workloads listed in `scripts/smoke-k8s-infra/startup-probe-required.txt`)
3. **In-cluster health checks** — Spawns an ephemeral curl pod to validate HTTP probe endpoints from inside the cluster

On failure:
- Generates **structured failure diagnostics** categorized by:
  - **Rollout failures**: Deployments/StatefulSets that timed out or failed to roll out
  - **Probe presence failures**: Containers missing required probes (readiness, liveness, startup)
  - **In-cluster health failures**: HTTP probe endpoints returning non-2xx status codes
- Creates **`probe-failures.json`**: Structured JSON output for CI/CD consumption
- Creates **`probe-diagnostics-summary.html`**: Visual HTML report with:
  - Pass/fail statistics dashboard
  - Detailed failure tables with timestamps
  - HTTP response diagnostics (headers, body snippets)
  - Links to full build logs
- Prints comprehensive diagnostics:
  - Pod status, describe output, events (last 200)
  - Container logs (last 60 lines per deployment)
  - HTTP response details for failed endpoints
- Exits non-zero (aborts the deployment pipeline)

**Failure Report Locations:**
- HTML Summary: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
- JSON Data: `build-logs/build-and-deploy-k8s/probe-failures.json`
- Full Logs: `build-logs/build-and-deploy-k8s/inv*__*__build-and-deploy-k8s-local.log`

**Report Rotation:**
The build-and-deploy pipeline automatically keeps the 3 most recent HTML summary reports and rotates older ones.

Optional environment variables:
- `ROLLOUT_TIMEOUT` (default: `300s`)
- `CURL_IMAGE` (default: `curlimages/curl:8.5.0`)

Run probe-aware smoke only:
```bash
make smoke-probes
```

Override namespace:
```bash
make smoke-probes NS=staging
```

**Viewing Diagnostics:**
After a failed deployment, open the HTML summary report to quickly identify:
- Which services failed rollout and why
- Which containers are missing which probes
- Which HTTP endpoints are failing and their response details

Example workflow:
```powershell
# Run deployment (will auto-generate diagnostics on failure)
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1

# Review failures in browser
Start-Process build-logs\build-and-deploy-k8s\probe-diagnostics-summary.html
```

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
  - `kubectl rollout restart deployment/agent-service -n dev`
  - `kubectl rollout restart deployment/client-service -n dev`
  - `kubectl rollout restart deployment/log-service -n dev`
  - `kubectl rollout status deployment/agent-service -n dev --timeout=180s`

### Pods fail readiness/liveness due to startup or DB issues
- Inspect logs:
  - `kubectl logs deployment/agent-service -n dev --tail=100`
  - `kubectl logs deployment/client-service -n dev --tail=100`
  - `kubectl logs deployment/log-service -n dev --tail=100`
  - `kubectl logs statefulset/postgres-postgresql -n dev --tail=100`
- Inspect events: `kubectl get events -n dev --sort-by=.metadata.creationTimestamp`

### Probe-aware smoke fails with missing probes
- Check the error output — it will specify which Deployment/container is missing which probe type
- Review the **HTML diagnostics summary**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
  - Look for "Probe Presence Failures" section
  - Identifies exact resource, container, and missing probe type
- Add missing probes to the deployment YAML in `platform/k8s/apps/base/<service>-deployment.yaml`
- For startup probes: if the service is slow-starting (e.g., JVM/Spring Boot), add it to `scripts/smoke-k8s-infra/startup-probe-required.txt`
- Re-apply: `kubectl apply -k platform/k8s/apps/overlays/dev`
- Rerun smoke: `make smoke-probes`

### Probe-aware smoke fails with rollout timeout
- Check the **HTML diagnostics summary**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
  - Look for "Rollout Failures" section
  - Review detailed output showing why rollout failed
- Check pod status: `kubectl get pods -n dev -o wide`
- Check events: `kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -50`
- Check logs for failing pods: `kubectl logs deployment/<service> -n dev --tail=100`
- Common causes:
  - Image pull failures (not loaded via `make kind-load`)
  - Probe configuration too strict (initialDelaySeconds too low, failureThreshold too low)
  - Application startup failures (check logs in diagnostics report)
  - Resource constraints (check pod describe output in diagnostics)

### In-cluster health checks fail
- Review the **HTML diagnostics summary**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
  - Look for "In-Cluster Health Failures" section
  - See exact HTTP status codes and response diagnostics
  - Review captured response headers and body snippets
- Common causes:
  - Service not listening on expected port (check service spec and container ports)
  - Probe path incorrect (verify URLs in deployment YAML)
  - Application not fully started (increase initialDelaySeconds)
  - DNS resolution issues (verify service name matches deployment)
- Debug manually with ephemeral pod:
  ```bash
  kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
    curl -v http://<service-name>.dev.svc.cluster.local:<port><path>
  ```

### Windows wrapper fails because Bash or Make is missing
- Install/verify Git Bash and Make in `PATH`
- Re-run:
  - `.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1`

## Service onboarding checklist (for this local flow)
When adding a new backend service:
- Add service code and Dockerfile under `services/backend/<new-service>`
- Add base deployment/service YAML under `platform/k8s/apps/base` and register in `platform/k8s/apps/base/kustomization.yaml`
  - **Include `readinessProbe` and `livenessProbe` for all containers** (probe-aware smoke enforces this)
  - If the service has slow cold-start (e.g., JVM/Spring Boot), add `startupProbe` and list it in `scripts/smoke-k8s-infra/startup-probe-required.txt`
- Add image tag entry and patches in `platform/k8s/apps/overlays/dev/kustomization.yaml`
- Add probe patches if needed in `platform/k8s/apps/overlays/dev/<service>-probes-patch.yaml` (tighter probe settings for dev)
- Add ingress rule if externally reachable
- Extend `Makefile` targets: `build-images`, `kind-load`, `deploy-dev`
- Extend `scripts/smoke-k8s-infra/smoke-k8s-infra.sh` with infrastructure-level checks for the new service (CRUD/integration tests)
- Probe-aware smoke (`scripts/smoke-k8s-infra/smoke-probes.sh`) automatically validates the new service's probes — no manual extension needed

