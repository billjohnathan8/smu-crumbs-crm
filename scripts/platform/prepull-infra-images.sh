#!/usr/bin/env bash
set -euo pipefail

# prepull-infra-images.sh: Pre-pull infrastructure images to speed up Helm deployments
# This script is called from the Makefile to ensure bash compatibility on all platforms
# It's best-effort: if image pulls fail, we continue anyway (Helm will pull them later)

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-cs301-crm}"

# Use commands from common setup
KIND="${KIND_CMD}"

echo "[prepull] Pre-pulling infrastructure images (best-effort)..."
echo "[prepull] This speeds up Helm deployments by caching large images (~1-2 GB total)"

# Define images used by Helm charts
# These versions should match what the Helm charts will actually deploy
IMAGES=(
    # ingress-nginx controller (largest image, ~800MB-1GB)
    "registry.k8s.io/ingress-nginx/controller:v1.14.3"
    "registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.6.7"

    # metrics-server (using official k8s registry, not bitnami image)
    "registry.k8s.io/metrics-server/metrics-server:v0.8.0"

    # bitnami postgresql (using 'latest' tag to match postgresql-values.yaml)
    "docker.io/bitnami/postgresql:latest"
)

# Track success/failure
pulled_count=0
failed_count=0
total_count=${#IMAGES[@]}

# Pull images with Docker
echo "[prepull] Pulling ${total_count} images with Docker..."
for image in "${IMAGES[@]}"; do
    echo "[prepull] Pulling: ${image}"
    if docker pull "${image}" 2>/dev/null; then
        pulled_count=$((pulled_count + 1))
        echo "[prepull] ✓ Pulled successfully"
    else
        failed_count=$((failed_count + 1))
        echo "[prepull] ✗ Failed to pull (will be pulled by Helm later)"
    fi
done

# Load successfully pulled images into kind cluster
echo "[prepull] Loading pulled images into kind cluster '${KIND_CLUSTER_NAME}'..."
loaded_count=0
for image in "${IMAGES[@]}"; do
    # Check if image exists in Docker
    if docker image inspect "${image}" >/dev/null 2>&1; then
        echo "[prepull] Loading: ${image}"
        if "$KIND" load docker-image "${image}" --name "${KIND_CLUSTER_NAME}" 2>/dev/null; then
            loaded_count=$((loaded_count + 1))
            echo "[prepull] ✓ Loaded into kind cluster"
        else
            echo "[prepull] ✗ Failed to load (will be pulled by Helm later)"
        fi
    fi
done

# Summary
echo "[prepull] ============================================"
echo "[prepull] Pre-pull Summary:"
echo "[prepull]   Total images:   ${total_count}"
echo "[prepull]   Pulled:         ${pulled_count}"
echo "[prepull]   Loaded to kind: ${loaded_count}"
echo "[prepull]   Failed:         ${failed_count}"
echo "[prepull] ============================================"

if [ $loaded_count -gt 0 ]; then
    echo "[prepull] ✓ Successfully pre-loaded ${loaded_count} image(s)"
    echo "[prepull] This should significantly speed up Helm deployments!"
else
    echo "[prepull] ⚠ No images were pre-loaded"
    echo "[prepull] Helm will pull images during deployment (may be slower)"
fi

# Always exit 0 (best-effort, never fail the pipeline)
exit 0
