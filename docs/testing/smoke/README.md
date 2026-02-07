# Smoke Testing Guide

This document provides comprehensive guidance on smoke testing for the CRM application deployed on local Kubernetes (kind) clusters.

## Overview

Smoke tests validate that deployed services are functionally operational and meet baseline health requirements. The CRM repository includes two complementary smoke test suites:

1. **Infrastructure Smoke Tests** — Validate HTTP endpoints, CRUD operations, and service integration
2. **Probe-Aware Smoke Tests** — Validate Kubernetes health probes, rollout status, and pod readiness

Both suites run automatically as part of the deployment pipeline and can be invoked independently for debugging.

## Quick Reference

### Run All Smoke Tests
```bash
make smoke
```

### Run Individual Test Suites

**Infrastructure smoke only:**
```bash
make smoke-infra
```

**Probe-aware smoke only:**
```bash
make smoke-probes
```

**Override namespace for probe tests:**
```bash
make smoke-probes NS=staging
```

## Infrastructure Smoke Tests

### Purpose
Validates that all CRM services are accessible through the ingress controller and can perform basic operations.

### Scripts
- **Windows**: `scripts/smoke-k8s-infra/smoke-k8s-infra.ps1`
- **macOS/Linux**: `scripts/smoke-k8s-infra/smoke-k8s-infra.sh`

### What Gets Tested

#### 1. Health Checks
All service health endpoints must return HTTP 200:
- `GET /api/agents/health` → `agent-service`
- `GET /api/clients/health` → `client-service`
- `GET /api/logs/health` → `log-service`
- `GET /api/transactions/health` → `transaction-service`

#### 2. Client CRUD Operations
Complete lifecycle validation for the Client service:
1. **Create**: `POST /api/clients` — Creates a new client with name, email, phone, address
2. **Read**: `GET /api/clients/{id}` — Retrieves the created client by ID
3. **Update**: `PUT /api/clients/{id}` — Updates client information
4. **Delete**: `DELETE /api/clients/{id}` — Deletes the client

#### 3. Transaction Listing
- **List Transactions**: `GET /api/transactions` — Validates endpoint accessibility and response format

#### 4. Log Event Ingestion
- **Post Log Event**: `POST /api/logs` — Sends a test log event and validates successful ingestion

#### 5. JWT Token Generation
- Generates HMAC-SHA256 signed JWT tokens for authenticated requests
- Uses configurable secret from `JWT_HMAC_SECRET` environment variable
- Includes standard claims: `sub`, `name`, `iat`, `exp`

### Network Modes

The infrastructure smoke tests support two network access modes:

1. **Ingress mode** (default): Uses ingress controller at `http://localhost`
2. **Port-forward mode** (fallback): Automatically used if ingress is unavailable

Port-forward mappings:
- Client Service: `localhost:8081 → client-service:80`
- Transaction Service: `localhost:8082 → transaction-service:80`
- Log Service: `localhost:8083 → log-service:80`
- Agent Service: `localhost:8084 → agent-service:80`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost` | Base URL for service endpoints |
| `JWT_HMAC_SECRET` | `dev-only-insecure-secret` | HMAC secret for JWT generation |

**Example:**
```bash
BASE_URL=http://localhost:8080 JWT_HMAC_SECRET=my-secret make smoke-infra
```

### Exit Codes
- **0**: All infrastructure smoke tests passed
- **Non-zero**: One or more tests failed

## Probe-Aware Smoke Tests

### Purpose
Validates that Kubernetes workloads have proper health probe configurations and that all probe endpoints are functional from inside the cluster.

### Scripts
- **Windows**: `scripts/smoke-k8s-infra/smoke-probes.ps1`
- **macOS/Linux**: `scripts/smoke-k8s-infra/smoke-probes.sh`

### Test Phases

#### Phase 1: Rollout Gating
Ensures all Deployments and StatefulSets have successfully rolled out before any HTTP checks run.

**What it checks:**
- Runs `kubectl rollout status deployment/<name> --timeout=<timeout>` for each Deployment
- Runs `kubectl rollout status statefulset/<name> --timeout=<timeout>` for each StatefulSet
- Gates all subsequent phases on rollout success
- If any workload fails to roll out, aborts immediately with diagnostics

**Configuration:**
- Default timeout: `300s` (5 minutes)
- Override via environment variable: `ROLLOUT_TIMEOUT=600s make smoke-probes`

**Success criteria:**
- All workloads reach ready state within timeout
- All replicas are available and healthy

#### Phase 2: Probe Presence Assertions
Validates that every container has required health probes configured.

**Required probes for all containers:**
- **readinessProbe**: Indicates when the container is ready to accept traffic
- **livenessProbe**: Indicates whether the container is running properly

**Conditional requirement:**
- **startupProbe**: Required only for workloads listed in `scripts/smoke-k8s-infra/startup-probe-required.txt`

**Startup probe requirements:**
Some services (typically JVM/Spring Boot applications with slow cold-starts) require explicit startup probes:

```
# scripts/smoke-k8s-infra/startup-probe-required.txt
Deployment/agent
Deployment/client
```

**Why startup probes matter:**
- Allows slow-starting applications to boot without failing liveness checks
- Separate from liveness probes to handle initialization vs runtime failures
- Prevents premature restart loops during application startup

**How it works:**
1. Fetches all Deployments and StatefulSets in the namespace as JSON
2. Iterates through each container in each workload
3. Checks for presence of `readinessProbe`, `livenessProbe`, and (conditionally) `startupProbe`
4. Records failures for any missing required probes

#### Phase 3: In-Cluster Health Checks
Validates that HTTP probe endpoints are accessible from inside the cluster using service DNS.

**How it works:**
1. **Probe discovery**: Extracts all HTTP probe endpoints from workload specs
   - Parses `readinessProbe`, `livenessProbe`, and `startupProbe` configurations
   - Resolves named ports to numeric values using container port definitions
   - Deduplicates endpoints (same service + port + path tested once)

2. **Service resolution**: Maps each deployment to its Kubernetes Service
   - Tries `<deployment-name>-service` first
   - Falls back to `<deployment-name>`
   - Falls back to selector-based lookup (`app=<deployment-name>`)

3. **Ephemeral pod execution**: Spawns a curl-based pod inside the cluster
   - Image: `curlimages/curl:8.5.0` (configurable via `CURL_IMAGE`)
   - Runs in the same namespace as the workloads
   - Uses service DNS: `<service-name>.<namespace>.svc.cluster.local`

4. **HTTP validation**: Tests each unique endpoint
   - Sends HTTP GET request to probe path
   - Expects HTTP 2xx status code
   - Captures response headers and body for failures

5. **TCP probe handling**: For TCP probes (non-HTTP)
   - Attempts TCP connect check
   - Reports inconclusive results (TCP connect doesn't verify application health)

**Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `CURL_IMAGE` | `curlimages/curl:8.5.0` | Image for ephemeral probe check pod |
| `ROLLOUT_TIMEOUT` | `300s` | Timeout for rollout checks |

**Success criteria:**
- All HTTP probe endpoints return status 200-299
- TCP probes successfully connect (informational only)

### Failure Diagnostics

When probe-aware smoke tests fail, comprehensive diagnostics are automatically generated and categorized.

#### Diagnostic Output Categories

**1. Rollout Failures**
- **Resource**: Deployment or StatefulSet name
- **Detail**: Why the rollout failed
- **Output**: Complete `kubectl rollout status` output
- **Timeout**: Configured timeout value

**2. Probe Presence Failures**
- **Resource**: Deployment or StatefulSet name
- **Container**: Container name
- **Missing Probe**: Type of probe (readinessProbe, livenessProbe, startupProbe)
- **Detail**: Explanation of requirement

**3. In-Cluster Health Failures**
- **Endpoint**: Service FQDN, port, and path
- **Status Code**: HTTP status code returned
- **Diagnostics**: Response headers and body (first 20 lines)
- **Detail**: Human-readable failure description

#### Diagnostic Artifacts

**1. Console Output**
- Color-coded failure summary with counts
- Detailed failure information grouped by category
- Pod status and descriptions
- Recent Kubernetes events (last 200)
- Container logs (last 60 lines per deployment)

**2. JSON Report** (for CI/CD automation)
- **Location**: `build-logs/build-and-deploy-k8s/probe-failures.json`
- **Format**:
  ```json
  {
    "timestamp": "2026-02-07T14:25:33Z",
    "namespace": "dev",
    "totalFailures": 5,
    "failuresByCategory": {
      "rollout": 1,
      "probePresence": 2,
      "inClusterHealth": 2
    },
    "errors": ["error1", "error2", ...]
  }
  ```

**3. HTML Summary Report** (requires Python 3.7+)
- **Location**: `build-logs/build-and-deploy-k8s/probe-diagnostics-summary.html`
- **Features**:
  - Visual dashboard with pass/fail statistics
  - Color-coded status indicators (green, yellow, red)
  - Detailed failure tables with timestamps
  - HTTP response diagnostics for failed endpoints
  - Links to full build logs
  - Responsive design for viewing on any device

**4. Comprehensive Deployment Summary** (requires Python 3.7+)
- **Location**: `build-logs/build-and-deploy-k8s/summary-k8s-deploy__<timestamp>.html`
- **Features**:
  - Overall deployment status with visual indicators
  - K8s manifest validation results (kubeconform, helm template)
  - Rollout status for all Deployments/StatefulSets
  - Probe presence check results
  - In-cluster health check results
  - Detailed failure diagnostics with logs
  - Modern, responsive UI

#### Report Rotation
- Up to **3 most recent reports** of each type are kept automatically
- Older reports are deleted to prevent build-logs directory bloat
- Reports use inverse timestamp naming for chronological sorting (newest first)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ROLLOUT_TIMEOUT` | `300s` | Timeout for `kubectl rollout status` checks |
| `CURL_IMAGE` | `curlimages/curl:8.5.0` | Container image for in-cluster probe checks |

**Example:**
```bash
ROLLOUT_TIMEOUT=600s CURL_IMAGE=curlimages/curl:latest make smoke-probes
```

### Exit Codes
- **0**: All probe-aware smoke tests passed
- **Non-zero**: One or more checks failed (rollout, probe presence, or health)

## Troubleshooting

### Infrastructure Smoke Failures

#### Connection Errors
**Symptom:**
```
curl: (7) Failed to connect to localhost port 80: Connection refused
```

**Diagnosis:**
1. Verify Kubernetes cluster is running:
   ```bash
   kubectl cluster-info
   ```

2. Check pod status:
   ```bash
   kubectl get pods -n dev -o wide
   ```

3. Verify ingress controller:
   ```bash
   kubectl get pods -n ingress-nginx
   kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=50
   ```

4. Check ingress resources:
   ```bash
   kubectl get ingress -n dev
   kubectl describe ingress -n dev
   ```

**Solutions:**
- Ensure ingress controller is running and ready
- Verify ingress paths match service routes
- Check for port conflicts on localhost
- Use port-forward mode if ingress is misconfigured

#### Health Endpoints Return 404
**Symptom:**
```
HTTP/1.1 404 Not Found
```

**Diagnosis:**
1. Verify services are deployed:
   ```bash
   kubectl get svc -n dev
   ```

2. Check ingress paths:
   ```bash
   kubectl get ingress -n dev -o yaml | grep -A5 paths
   ```

3. Test service directly (bypass ingress):
   ```bash
   kubectl port-forward -n dev svc/client-service 8081:80
   curl http://localhost:8081/health
   ```

**Solutions:**
- Ensure service paths match ingress configuration
- Verify application is listening on correct port
- Check application logs for routing errors

#### CRUD Operations Fail
**Symptom:**
```
Client creation failed with status 500
```

**Diagnosis:**
1. Check database connectivity:
   ```bash
   kubectl get pods -n dev -l app.kubernetes.io/name=postgresql
   kubectl logs -n dev -l app.kubernetes.io/name=postgresql --tail=50
   ```

2. Check service logs:
   ```bash
   kubectl logs -n dev -l app=client --tail=100
   ```

3. Check service environment variables:
   ```bash
   kubectl describe pod -n dev -l app=client | grep -A10 Environment
   ```

**Solutions:**
- Ensure PostgreSQL is running and ready
- Verify database connection strings in service configs
- Check for database migration failures
- Review service logs for SQL errors

### Probe-Aware Smoke Failures

#### Rollout Timeout
**Symptom:**
```
deployment/agent rollout timed out or failed
```

**Diagnosis:**
1. Check the HTML summary report (if Python installed):
   ```bash
   # Windows
   Start-Process build-logs\build-and-deploy-k8s\summary-k8s-deploy__*.html

   # macOS/Linux
   open build-logs/build-and-deploy-k8s/summary-k8s-deploy__*.html
   ```

2. Check pod status:
   ```bash
   kubectl get pods -n dev -o wide
   ```

3. Check events:
   ```bash
   kubectl get events -n dev --sort-by=.metadata.creationTimestamp | tail -50
   ```

4. Check logs:
   ```bash
   kubectl logs deployment/<service> -n dev --tail=100
   ```

5. Describe pod for detailed status:
   ```bash
   kubectl describe pod -n dev -l app=<service>
   ```

**Common causes:**
- **ImagePullBackOff**: Image not loaded into kind cluster
  - Solution: Run `make kind-load` and restart deployment
- **CrashLoopBackOff**: Application fails to start
  - Solution: Check logs for errors, fix application code
- **Insufficient resources**: Not enough CPU/memory
  - Solution: Adjust resource requests/limits or increase kind cluster capacity
- **Probe too strict**: Liveness probe kills container before it's ready
  - Solution: Increase `initialDelaySeconds` or add/tune `startupProbe`

#### Missing Probe
**Symptom:**
```
Deployment/agent container=agent: MISSING readinessProbe
```

**Diagnosis:**
Check the HTML summary report "Probe Presence Failures" section to see:
- Which resource is missing the probe
- Which container within the resource
- Which probe type is missing

**Solution:**
1. Add the missing probe to the deployment YAML in `platform/k8s/apps/base/<service>-deployment.yaml`:
   ```yaml
   readinessProbe:
     httpGet:
       path: /health
       port: http
     initialDelaySeconds: 10
     periodSeconds: 5
     failureThreshold: 3
   
   livenessProbe:
     httpGet:
       path: /health
       port: http
     initialDelaySeconds: 30
     periodSeconds: 10
     failureThreshold: 3
   ```

2. For slow-starting services (JVM/Spring Boot), add `startupProbe` and list in `scripts/smoke-k8s-infra/startup-probe-required.txt`:
   ```yaml
   startupProbe:
     httpGet:
       path: /health
       port: http
     initialDelaySeconds: 0
     periodSeconds: 10
     failureThreshold: 30  # 5 minutes max startup time
   ```

3. Re-apply:
   ```bash
   kubectl apply -k platform/k8s/apps/overlays/dev
   ```

4. Rerun smoke:
   ```bash
   make smoke-probes
   ```

#### In-Cluster Health Check Failure
**Symptom:**
```
HTTP agent-service.dev.svc.cluster.local:80/health
  FAIL (HTTP 503)
```

**Diagnosis:**
1. Check the HTML summary report "In-Cluster Health Failures" section for:
   - Exact endpoint that failed
   - HTTP status code
   - Response headers and body diagnostics

2. Test the endpoint manually with ephemeral pod:
   ```bash
   kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n dev -- \
     curl -v http://agent-service.dev.svc.cluster.local:80/health
   ```

3. Check if service is listening:
   ```bash
   kubectl exec -it -n dev deployment/agent -- netstat -tlnp
   ```

4. Check application logs:
   ```bash
   kubectl logs -n dev -l app=agent --tail=100
   ```

**Common causes:**
- **Wrong port**: Service listening on different port than configured
  - Solution: Verify `containerPort` matches application's listening port
- **Wrong path**: Probe path doesn't match application's health endpoint
  - Solution: Verify probe path in deployment YAML
- **Application not ready**: Service hasn't finished initialization
  - Solution: Increase `initialDelaySeconds` or add `startupProbe`
- **DNS issues**: Service name doesn't match deployment
  - Solution: Verify service selector matches pod labels

## Integration with Deployment Pipeline

### Automatic Execution

Smoke tests run automatically as part of:

1. **Build and Deploy Pipeline** (`scripts/build-and-deploy-k8s/`)
   - After Kubernetes deployment completes
   - Runs both infrastructure and probe-aware smoke
   - On success: tears down cluster
   - On failure: preserves cluster for debugging

2. **Test and Spinup All Pipeline** (`scripts/test-and-spinup-all/`)
   - After all backend/frontend tests pass
   - After Kubernetes deployment completes
   - Same smoke test sequence as deploy pipeline

### Manual Execution

You can run smoke tests independently at any time:

```bash
# Full smoke suite
make smoke

# Individual suites
make smoke-infra
make smoke-probes

# Different namespace
make smoke-probes NS=staging
```

## Best Practices

### For Service Developers

1. **Always include health probes** in deployment manifests:
   - `readinessProbe`: Validates service is ready for traffic
   - `livenessProbe`: Validates service is running correctly
   - `startupProbe`: For slow-starting applications (JVM, large frameworks)

2. **Test probes locally** before deploying:
   ```bash
   # Build and deploy
   make deploy-dev
   
   # Run just probe checks
   make smoke-probes
   ```

3. **Tune probe timings** based on application characteristics:
   - Fast-starting apps: Lower `initialDelaySeconds`, higher frequency
   - Slow-starting apps: Add `startupProbe`, higher `initialDelaySeconds`
   - Database-dependent apps: Account for DB connection time

4. **Monitor HTML diagnostics** for failures:
   - Review probe diagnostics summary for detailed failure analysis
   - Use categorized failures to quickly identify root cause

### For CI/CD Integration

1. **Check exit codes**:
   ```bash
   if make smoke; then
     echo "Smoke tests passed"
   else
     echo "Smoke tests failed"
     cat build-logs/build-and-deploy-k8s/probe-failures.json
     exit 1
   fi
   ```

2. **Parse JSON reports** for automation:
   ```bash
   python3 -c "
   import json
   with open('build-logs/build-and-deploy-k8s/probe-failures.json') as f:
       data = json.load(f)
       print(f'Total failures: {data[\"totalFailures\"]}')
       print(f'Rollout: {data[\"failuresByCategory\"][\"rollout\"]}')
       print(f'Probe presence: {data[\"failuresByCategory\"][\"probePresence\"]}')
       print(f'Health: {data[\"failuresByCategory\"][\"inClusterHealth\"]}')
   "
   ```

3. **Archive HTML reports** as build artifacts for historical analysis

4. **Set appropriate timeouts** for slow environments:
   ```bash
   ROLLOUT_TIMEOUT=900s make smoke-probes
   ```

## Related Documentation

- [Local K8s Development Guide](../../local-k8s-dev.md) - Complete local Kubernetes setup
- [Build and Deploy Scripts README](../../../scripts/build-and-deploy-k8s/README.md) - Deployment pipeline details
- [Smoke Scripts README](../../../scripts/smoke-k8s-infra/README.md) - Script-level documentation
- [ADR-0002](../../architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md) - Local K8s workflow standards

## See Also

- [Kubernetes Probe Best Practices](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Makefile](../../../Makefile) - Build targets reference
- [probe-required list](../../../scripts/smoke-k8s-infra/startup-probe-required.txt) - Startup probe requirements
