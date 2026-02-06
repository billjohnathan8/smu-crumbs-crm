# Test and Spin-Up All Services

This directory contains scripts to run a complete end-to-end workflow: test all services (backend + frontend), generate coverage reports, and deploy to a local Kubernetes cluster.

## Overview

The test-and-spinup-all script performs the following steps in sequence:

1. **Full Test Pipeline** - Runs [`build-and-test-all`](../build-and-test-all/README.md) which:
   - Tests all backend services (Gradle Java + Python)
   - Tests frontend service (React/TypeScript)
   - Generates comprehensive coverage reports for all services
   - Creates an aggregated coverage report

2. **Build & Deploy** - Runs [`build-and-deploy-k8s`](../build-and-deploy-k8s/) which:
   - Builds Docker images for all services
   - Deploys to local Kubernetes cluster (kind)
   - Runs smoke tests to verify deployment

If the test pipeline fails, deployment is skipped.

## Usage

### Windows (PowerShell)

```powershell
.\scripts\test-and-spinup-all.cmd
```

or

```powershell
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1
```

### Linux/macOS (Bash)

```bash
./scripts/test-and-spinup-all/test-and-spinup-all.sh
```

## Prerequisites

### For Testing
- **Backend Services**: JDK 11+, Python 3.8+
- **Frontend Service**: Node.js v16+, npm v8+
- **Report Generation**: Python 3.8+

### For Deployment
- **Docker**: For building service images
- **kind**: For local Kubernetes cluster
- **kubectl**: For Kubernetes management
- **Helm**: For infrastructure deployment
- **Make**: For orchestrating deployment steps

## Output

### Logs
Build logs are saved to `build-logs/test-and-spinup-all/` with timestamped filenames. The most recent 3 logs are retained.

### Coverage Reports

After successful testing, coverage reports are available at:

#### Aggregated Report (All Services)
- **Location**: `build-logs/build-and-test-all/index.html`
- **Contains**: Combined coverage from all backend and frontend services

#### Backend Report
- **Location**: `build-logs/build-and-test-backend/index.html`
- **Contains**: Coverage for all backend services

#### Frontend Report
- **Location**: `services/frontend/crm-ui/coverage/index.html`
- **Contains**: Coverage for React/TypeScript frontend

### Deployment

After successful deployment, services are running in a local Kubernetes cluster:
- Cluster name: `cs301-crm` (configurable via `KIND_CLUSTER_NAME`)
- Namespace: `dev`
- Services accessible via ingress at `http://localhost`

## What Gets Tested

### Backend Services
- ✅ Code compilation
- ✅ Static analysis (Checkstyle for Java)
- ✅ Unit tests
- ✅ Integration tests
- ✅ Code coverage (JaCoCo for Java, coverage.py for Python)

### Frontend Service
- ✅ TypeScript type checking
- ✅ ESLint linting
- ✅ Code formatting (Prettier)
- ✅ Production build
- ✅ Unit/component/integration tests (Vitest)
- ✅ Code coverage (Vitest/Istanbul)

### Deployment
- ✅ Docker image builds
- ✅ Kubernetes deployment
- ✅ Service health checks
- ✅ Smoke tests (API endpoints)

## Exit Codes

- `0`: All tests passed and deployment successful
- `1`: Tests failed (deployment skipped) or deployment failed

## Workflow

```
┌─────────────────────────────────────────┐
│  Test and Spin-Up All                  │
└─────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Step 1: Full Test Pipeline            │
│  (build-and-test-all)                   │
├─────────────────────────────────────────┤
│  • Test backend services                │
│  • Test frontend service                │
│  • Generate coverage reports            │
│  • Create aggregated report             │
└─────────────────────────────────────────┘
                 │
                 │ Tests Pass?
                 ▼
┌─────────────────────────────────────────┐
│  Step 2: Build & Deploy to k8s          │
│  (build-and-deploy-k8s)                 │
├─────────────────────────────────────────┤
│  • Build Docker images                  │
│  • Load images to kind                  │
│  • Deploy to k8s cluster                │
│  • Run smoke tests                      │
└─────────────────────────────────────────┘
                 │
                 ▼
          ┌─────────────┐
          │   Success   │
          └─────────────┘
```

## Continuous Integration

This script is ideal for CI/CD pipelines to ensure all services are tested and can be deployed successfully:

```bash
# Run full pipeline
./scripts/test-and-spinup-all/test-and-spinup-all.sh

# Check exit code
if [ $? -eq 0 ]; then
  echo "All tests passed and deployment successful"
else
  echo "Pipeline failed"
  exit 1
fi
```

## Troubleshooting

### Tests failing
Check individual test logs:
- Backend: `build-logs/build-and-test-backend/`
- Frontend: `build-logs/build-and-test-frontend/`
- Aggregated: `build-logs/build-and-test-all/`

### Deployment failing
Check deployment logs:
- Build/Deploy: `build-logs/build-and-deploy-k8s/`
- Overall: `build-logs/test-and-spinup-all/`

### Kubernetes issues
```bash
# Check cluster status
kind get clusters

# Check pods
kubectl get pods -n dev

# Check logs
kubectl logs deployment/<service-name> -n dev
```

## Files

- `test-and-spinup-all.ps1` - PowerShell implementation (Windows)
- `test-and-spinup-all.sh` - Bash implementation (Linux/macOS)
- `README.md` - This file

## Related Scripts

- [`build-and-test-all`](../build-and-test-all/README.md) - Full test pipeline with coverage
- [`build-and-deploy-k8s`](../build-and-deploy-k8s/) - Kubernetes deployment
- [`build-and-test-backend`](../build-and-test-backend/) - Backend testing only
- [`build-and-test-frontend`](../build-and-test-frontend/) - Frontend testing only
