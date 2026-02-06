# Smoke Tests for Local Kubernetes Infrastructure

This directory contains smoke test scripts that validate the deployed CRM application on a local Kubernetes cluster.

## Purpose

The smoke tests verify that all deployed services are functioning correctly by:
- Testing health endpoints through the ingress controller
- Performing CRUD operations (Create, Read, Update, Delete) on clients
- Listing transactions through the transaction service
- Posting log events to the log service
- Validating JWT token generation and authentication

## Scripts

### `smoke-k8s-infra.ps1` (Windows PowerShell)
Windows-compatible smoke test script that validates all CRM services.

**Usage:**
```powershell
# Run from project root
powershell -ExecutionPolicy Bypass -File scripts/smoke-k8s-infra/smoke-k8s-infra.ps1

# Or via Makefile (recommended)
make smoke
```

### `smoke-k8s-infra.sh` (Bash - macOS/Linux)
Unix-compatible smoke test script that validates all CRM services.

**Usage:**
```bash
# Run from project root
bash scripts/smoke-k8s-infra/smoke-k8s-infra.sh

# Or via Makefile (recommended)
make smoke
```

## Environment Variables

Both scripts support the following optional environment variables:

- **`BASE_URL`**: Base URL for the CRM services (default: `http://localhost`)
- **`JWT_HMAC_SECRET`**: HMAC secret for JWT token generation (default: `dev-only-insecure-secret`)

**Example:**
```bash
BASE_URL=http://localhost:8080 JWT_HMAC_SECRET=my-secret make smoke
```

## What Gets Tested

### 1. Health Checks
- **Client Service**: `GET /health`
- **Transaction Service**: `GET /health`
- **Log Service**: `GET /health`
- **Agent Service**: `GET /health`

All health endpoints must return HTTP 200 status.

### 2. Client CRUD Operations
1. **Create Client**: `POST /clients`
   - Creates a new client with name, email, phone, address
   - Validates response contains client ID

2. **Read Client**: `GET /clients/{id}`
   - Retrieves the created client by ID
   - Validates response matches created data

3. **Update Client**: `PUT /clients/{id}`
   - Updates client information
   - Validates successful update

4. **Delete Client**: `DELETE /clients/{id}`
   - Deletes the client
   - Validates successful deletion

### 3. Transaction Listing
- **List Transactions**: `GET /transactions`
- Validates the endpoint is accessible and returns a list

### 4. Log Event Ingestion
- **Post Log Event**: `POST /logs`
- Sends a test log event with timestamp, level, service, message
- Validates successful ingestion

### 5. JWT Token Generation
- Generates a JWT token using HMAC-SHA256 algorithm
- Uses configurable secret from environment or default
- Includes standard claims: `sub`, `name`, `iat`, `exp`
- Token is used for authenticated requests to protected endpoints

## Ingress vs Port-Forward

The smoke tests are designed to work with Kubernetes ingress:
- **Default**: Uses ingress controller at `http://localhost` (or `BASE_URL`)
- **Fallback**: If ingress is not available, the scripts fall back to kubectl port-forwarding

Service port mapping for port-forward fallback:
- Client Service: `localhost:8081`
- Transaction Service: `localhost:8082`
- Log Service: `localhost:8083`
- Agent Service: `localhost:8084`

## Exit Codes

- **0**: All smoke tests passed successfully
- **Non-zero**: One or more tests failed

## Invocation in CI/CD Pipeline

The smoke tests are automatically executed as part of:

1. **`make smoke`**: Standalone smoke test invocation
2. **`scripts/build-and-deploy-k8s/`**: After Kubernetes deployment
3. **`scripts/test-and-spinup-all/`**: After full test pipeline and deployment

## Typical Workflow

```bash
# 1. Build and deploy to local Kubernetes
make deploy-dev

# 2. Run smoke tests to verify deployment
make smoke

# Or combine both steps
scripts/test-and-spinup-all.cmd
```

## Troubleshooting

### Smoke Tests Fail with Connection Errors
- Verify Kubernetes cluster is running: `kubectl cluster-info`
- Check pod status: `kubectl get pods -n dev`
- Verify ingress controller is running: `kubectl get pods -n ingress-nginx`
- Check ingress resources: `kubectl get ingress -n dev`

### Health Endpoints Return 404
- Verify services are deployed: `kubectl get svc -n dev`
- Check ingress configuration: `kubectl describe ingress -n dev`
- Ensure ingress paths match service routes

### JWT Authentication Fails
- Ensure `JWT_HMAC_SECRET` matches the secret configured in deployed services
- Check service logs for authentication errors: `kubectl logs -n dev <pod-name>`

### CRUD Operations Fail
- Verify database connectivity (if applicable)
- Check client logs: `kubectl logs -n dev -l app=client`
- Ensure database migrations have run successfully

## See Also

- [Makefile](../../Makefile): Orchestrates `kind-up`, `infra-up`, `build-images`, `kind-load`, `deploy-dev`, and `smoke` targets
- [Local Kubernetes Development Guide](../../docs/local-k8s-dev.md): Comprehensive guide for local Kubernetes setup
- [Build and Deploy Scripts](../build-and-deploy-k8s/): Scripts for building and deploying to local Kubernetes
- [ADR-0002](../../docs/architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md): Standardize Local K8s Deploy Workflow
