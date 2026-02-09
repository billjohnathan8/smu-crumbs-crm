# Infrastructure Image Pre-Pulling

## Overview

The infrastructure image pre-pull feature speeds up Kubernetes deployments by caching large Docker images **before** Helm tries to deploy them. This is particularly useful on fresh dev machines or slower networks where pulling multi-gigabyte images can cause deployment timeouts.

## Why Pre-Pull?

Infrastructure images (especially ingress-nginx) are large:
- **ingress-nginx controller**: ~800MB-1GB
- **bitnami/postgresql**: ~200-300MB
- **bitnami/metrics-server**: ~150-200MB

On first deployment, Helm waits for pods to be ready, which includes waiting for Docker to pull these images. On slower networks, this can exceed timeout limits and cause deployment failures.

**Pre-pulling solves this by:**
1. Pulling images in advance (with clear progress)
2. Loading them into the kind cluster cache
3. Making subsequent Helm deployments instant (images already cached)

## Usage

### Option 1: Makefile (Recommended)

```bash
# Fast deployment with pre-pull (recommended for fresh machines)
make build-and-deploy-local-fast

# Standard deployment without pre-pull
make build-and-deploy-local

# Pre-pull only (useful before running Helm deployments)
make prepull-infra-images
```

### Option 2: Python Pipeline

```bash
# With pre-pull
python scripts/pipelines/deploy_k8s.py --prepull

# Without pre-pull (default)
python scripts/pipelines/deploy_k8s.py

# Combine with other options
python scripts/pipelines/deploy_k8s.py --prepull --keep
```

### Option 3: Standalone Script

```bash
# Run pre-pull independently
bash scripts/platform/prepull-infra-images.sh
```

## How It Works

The pre-pull script:
1. Pulls all infrastructure images using Docker
2. Loads them into the kind cluster's internal image cache
3. Reports success/failure statistics
4. **Always exits successfully** (best-effort, never fails pipeline)

### Best-Effort Design

The pre-pull feature is designed to be **completely optional and safe**:
- If image pulls fail, the script continues (Helm will pull later)
- If loading into kind fails, the script continues
- The script **never** causes deployment failures
- You can skip pre-pull entirely with no impact

## When to Use Pre-Pull

### ✅ Use Pre-Pull When:
- Setting up a fresh dev machine
- Working on a slow network
- Repeatedly tearing down and recreating clusters
- Want faster feedback during development

### ❌ Skip Pre-Pull When:
- Images are already cached (subsequent deployments)
- Running in CI (GitHub Actions has fast network)
- Just iterating on application code (not infra)

## Performance Impact

### Without Pre-Pull (First Time)
```
kind-up:        ~1 min
infra-up:       5-10 min (pulling images during Helm install)
Total:          6-11 min
```

### With Pre-Pull (First Time)
```
kind-up:        ~1 min
prepull:        3-5 min (pull + progress bars)
infra-up:       ~1 min (images cached)
Total:          5-7 min
```

### Subsequent Runs (Either Way)
```
kind-up:        ~30 sec (cluster exists)
infra-up:       ~1 min (images cached)
Total:          ~2 min
```

## GitHub Actions / CI

Pre-pull is **not needed in CI** because:
- GitHub Actions runners have fast network
- Standard timeouts work fine
- The reusable workflow doesn't use `--prepull` flag

To avoid adding unnecessary CI time, the default is **no pre-pull**. Only opt-in when needed for local development.

## Troubleshooting

### Pre-Pull Fails to Pull Images

**This is OK!** The script is best-effort. If it can't pull images, Helm will pull them during deployment (like it always did).

### How to Check if Images are Cached

```bash
# Check Docker images
docker images | grep -E 'ingress-nginx|metrics-server|postgresql'

# Check kind cluster cache
docker exec -it cs301-crm-control-plane crictl images | grep -E 'ingress-nginx|metrics-server|postgresql'
```

### Clear Image Cache (Force Fresh Pull)

```bash
# Remove from Docker
docker rmi registry.k8s.io/ingress-nginx/controller:v1.14.3

# Delete and recreate cluster (clears kind cache)
kind delete cluster --name cs301-crm
make kind-up
```

## Image Versions

The pre-pull script pulls specific image versions that match the Helm chart defaults. These are defined in:
- **Script**: `scripts/platform/prepull-infra-images.sh`
- **Images pulled**:
  - `registry.k8s.io/ingress-nginx/controller:v1.14.3`
  - `registry.k8s.io/ingress-nginx/kube-webhook-certgen:v20250202-stable-patch1`
  - `docker.io/bitnami/metrics-server:0.7.2-debian-12-r7`
  - `docker.io/bitnami/postgresql:17.2.0-debian-12-r10`

**Note**: If Helm chart versions are upgraded, these image tags may need updating in the script.

## Examples

### Fresh Machine Setup (Recommended)
```bash
# Clean slate
kind delete cluster --name cs301-crm

# Deploy with pre-pull (faster)
make build-and-deploy-local-fast
```

### Quick Iteration (Skip Pre-Pull)
```bash
# Images already cached, no need for pre-pull
make build-and-deploy-local
```

### Pre-Pull Before Manual Helm Install
```bash
# Create cluster
make kind-up

# Pre-pull images
make prepull-infra-images

# Manually install Helm charts (images cached)
make infra-up
```

## Summary

- **Opt-in feature**: Default behavior unchanged
- **Safe and best-effort**: Never breaks deployments
- **Performance boost**: 30-50% faster on fresh machines
- **CI-friendly**: Doesn't add overhead to GitHub Actions
- **Easy to use**: Single flag or Makefile target
