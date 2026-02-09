# Infrastructure Image Pre-Pulling

> **Breaking Change (Feb 2026):** Pre-pull is now **enabled by default** and **fails-fast** on errors.
> This ensures reliable deployments on fresh machines. Use `--no-prepull` or `--best-effort` flags to opt out.

## Overview

The infrastructure image pre-pull feature is now **enabled by default** in all deployment workflows. It speeds up Kubernetes deployments by caching large Docker images **before** Helm tries to deploy them, preventing timeout failures on fresh machines.

## Why Default Pre-Pull?

Infrastructure images are large, and without pre-pull, **deployments fail with timeouts** even on fast networks:

- **ingress-nginx controller**: ~800MB-1GB
- **metrics-server**: ~100-150MB
- **bitnami/postgresql**: ~200-300MB
- **Total**: ~1-2GB to download

On fresh machines, Helm's 10-15 minute timeout is insufficient for pulling, extracting, and starting these images. Pre-pull solves this by:

1. **Pulling images in parallel before Helm starts** (not during deployment)
2. **Showing real-time progress** (not silent 10-minute waits)
3. **Verifying images** after pulling
4. **Failing fast** with clear errors if Docker is unavailable or pulls fail

## Usage

### Default Behavior (Pre-Pull Enabled)

```bash
# Makefile - pre-pull is automatic
make build-and-deploy-local

# Python Pipeline - pre-pull is automatic
python scripts/pipelines/deploy_k8s.py

# Standalone pre-pull script
python scripts/platform/prepull-infra-images.py
```

All commands above now **automatically pre-pull** infrastructure images by default.

### Opt-Out (Not Recommended for Fresh Machines)

```bash
# Makefile - skip pre-pull
make build-and-deploy-local-no-prepull

# Python Pipeline - skip pre-pull
python scripts/pipelines/deploy_k8s.py --no-prepull

# Standalone script - best-effort mode
python scripts/platform/prepull-infra-images.py --best-effort
```

**Warning**: Skipping pre-pull on fresh machines **will cause timeouts** during Helm deployment.

## Fail-Fast vs Best-Effort Mode

### Fail-Fast Mode (Default)

```bash
# Default behavior - exits 1 on failure
python scripts/platform/prepull-infra-images.py
```

**Behavior:**
- Requires Docker to be running (fails immediately if not)
- Requires kind cluster to exist (fails immediately if not)
- Verifies images after pulling
- Exits with code 1 on any failure
- Shows real-time docker pull progress

**When to use:** Production workflows, fresh machine setup, CI/CD

### Best-Effort Mode (Legacy)

```bash
# Best-effort - never fails, always exits 0
python scripts/platform/prepull-infra-images.py --best-effort
```

**Behavior:**
- Continues if Docker/kind unavailable
- Continues if image pulls fail
- Always exits with code 0
- Helm will pull images later (may timeout)

**When to use:** Testing, debugging, when images are known to be cached

## How It Works

The pre-pull script:

1. **Checks dependencies** - Ensures Docker and kind are available
2. **Pulls images** - Downloads all 4 infrastructure images with progress bars
3. **Verifies images** - Checks images exist using `docker image inspect`
4. **Loads into kind** - Imports images into kind cluster cache
5. **Reports status** - Shows detailed summary with counts

### Images Pulled

```python
# As of Feb 2026, pre-pull pulls:
registry.k8s.io/ingress-nginx/controller:v1.14.3
registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.6.7
registry.k8s.io/metrics-server/metrics-server:v0.8.0
docker.io/bitnami/postgresql:latest
```

**Note**: Image versions should match Helm chart values in `platform/k8s/infra/helm-values/`.

## When to Use Pre-Pull

### ✅ Use Pre-Pull (Default Behavior)

- Setting up a fresh dev machine
- First deployment on any machine
- After clearing Docker cache
- After deleting and recreating clusters
- When Helm timeouts occur

### ❌ Skip Pre-Pull (Opt-Out)

- Images already cached from previous run
- Iterating on application code only (no infra changes)
- Advanced troubleshooting scenarios
- Testing Helm chart changes in isolation

## Performance Impact

### Fresh Machine with Pre-Pull (Default)
```
kind-up:                ~1 min
prepull-infra-images:   3-5 min (with progress bars)
infra-up:               1-2 min (images cached)
build-images:           2-3 min
kind-load:              ~30 sec
deploy-dev:             ~1 min
smoke:                  ~30 sec
───────────────────────────────
Total:                  8-13 min
```

### Fresh Machine WITHOUT Pre-Pull (Opt-Out)
```
kind-up:                ~1 min
infra-up:               10-15 min (pulling during Helm install)
                        OR TIMEOUT FAILURE
───────────────────────────────
Total:                  11-16 min OR FAILS
```

### Subsequent Runs (Images Cached)
```
Total:                  3-5 min (pre-pull completes instantly)
```

## Advanced Options

### Custom Timeout Per Image

```bash
# Default timeout is 900s (15 minutes) per image
python scripts/platform/prepull-infra-images.py --timeout 1800
```

Use higher timeout for very slow networks.

### Standalone Pre-Pull (Before Manual Deployment)

```bash
# Create cluster
make kind-up

# Pre-pull images
make prepull-infra-images

# Manually install Helm charts (images cached)
make infra-up
```

## Troubleshooting

### Error: Docker Not Running

```
ERROR: Docker not found - pre-pull cannot continue
Fix: Install Docker Desktop and ensure daemon is running
```

**Solution:**
1. Start Docker Desktop
2. Verify: `docker ps` works
3. Retry deployment

### Error: Pre-Pull Timeout

```
ERROR: Timeout pulling image after 900s
```

**Solutions:**
1. Increase timeout: `python scripts/platform/prepull-infra-images.py --timeout 1800`
2. Check network speed: `docker pull registry.k8s.io/ingress-nginx/controller:v1.14.3` manually
3. Use best-effort mode if needed: `--best-effort`

### Error: Kind Cluster Not Found

```
ERROR: Kind not found - pre-pull cannot continue
```

**Solution:**
1. Ensure kind cluster exists: `kind get clusters`
2. Create cluster: `make kind-up`
3. Retry deployment

### Verify Images Are Cached

```bash
# Check Docker images
docker images | grep -E 'ingress-nginx|metrics-server|postgresql'

# Check kind cluster cache
docker exec -it cs301-crm-control-plane crictl images
```

### Clear Image Cache (Force Fresh Pull)

```bash
# Remove specific image from Docker
docker rmi registry.k8s.io/ingress-nginx/controller:v1.14.3

# OR: Delete cluster (clears all cached images)
kind delete cluster --name cs301-crm

# Then redeploy (will pull fresh images)
make build-and-deploy-local
```

## CI/CD Considerations

### GitHub Actions

Pre-pull is **beneficial in CI** but adds ~1 minute to workflow time:

```yaml
# Option 1: Keep default (pre-pull enabled)
- name: Deploy to Kind
  run: python scripts/pipelines/deploy_k8s.py

# Option 2: Opt-out if images cached in CI
- name: Deploy to Kind
  run: python scripts/pipelines/deploy_k8s.py --no-prepull
```

**Recommendation**: Keep pre-pull enabled in CI for reliability. GitHub Actions has fast network, so impact is minimal.

## Migration Guide

### Before (Opt-In Pre-Pull)

```bash
# Old way - pre-pull was opt-in
make build-and-deploy-local-fast
python scripts/pipelines/deploy_k8s.py --prepull
```

### After (Pre-Pull by Default)

```bash
# New way - pre-pull is automatic
make build-and-deploy-local
python scripts/pipelines/deploy_k8s.py
```

**No changes needed!** The `-fast` variant still works but is now identical to the default.

To opt-out of pre-pull (not recommended for fresh machines):

```bash
make build-and-deploy-local-no-prepull
python scripts/pipelines/deploy_k8s.py --no-prepull
```

## FAQ

### Q: Why fail-fast instead of best-effort?

**A:** Best-effort mode silently failed, causing users to waste 10+ minutes before hitting Helm timeouts. Fail-fast provides immediate feedback with actionable error messages.

### Q: What if I don't have Docker Desktop?

**A:** Pre-pull requires Docker. Install Docker Desktop, or use `--no-prepull` (deployments will be slower and may timeout).

### Q: Can I skip pre-pull for faster iteration?

**A:** Yes, use `make build-and-deploy-local-no-prepull`. But only skip if images are **already cached** from a previous run.

### Q: Does pre-pull work on Windows/WSL?

**A:** Yes! The Python script handles `.exe` executables and cross-platform paths automatically.

### Q: How do I verify pre-pull is working?

**A:** Watch for real-time docker pull progress bars. If successful, you'll see:
```
[INFO] Pre-pulling infrastructure images...
[INFO] [1/4] registry.k8s.io/ingress-nginx/controller:v1.14.3
... docker pull output with progress bars ...
[SUCCESS] All 4 images loaded successfully!
```

## Summary

- **Default Behavior**: Pre-pull is **enabled** by default (breaking change from Feb 2026)
- **Fail-Fast Design**: Exits with code 1 on errors for immediate feedback
- **Opt-Out Available**: Use `--no-prepull` or `-no-prepull` target to skip
- **Fresh Machine Reliability**: Prevents timeout failures on first deployment
- **Performance**: 8-13 minutes vs 11-16 minutes (or failure) without pre-pull
- **CI-Friendly**: Adds ~1 min to CI workflows, improves reliability
- **Cross-Platform**: Works on Windows, macOS, Linux, WSL

**Recommendation**: Keep pre-pull enabled (default). Only opt-out if images are known to be cached and you're iterating quickly.
