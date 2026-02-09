#!/usr/bin/env bash
set -euo pipefail

# kind-up.sh: Initialize kind cluster with retry logic
# This script is called from the Makefile to ensure bash compatibility on all platforms

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-cs301-crm}"

# Use commands from common setup
KUBECTL="${KUBECTL_CMD}"
KIND="${KIND_CMD}"

# Check if cluster already exists
if "$KUBECTL" cluster-info --context "kind-${KIND_CLUSTER_NAME}" >/dev/null 2>&1; then
    echo "[kind-up] Cluster '${KIND_CLUSTER_NAME}' already exists and is accessible"
    exit 0
fi

# Create cluster with retry logic
for i in 1 2 3; do
    echo "[kind-up] Attempt $i/3: Creating kind cluster ${KIND_CLUSTER_NAME}..."
    if "$KIND" create cluster --name "${KIND_CLUSTER_NAME}" --config platform/k8s/infra/kind-config.yaml; then
        echo "[kind-up] Cluster created successfully"
        break
    elif [ $i -lt 3 ]; then
        echo "[kind-up] Kind cluster creation failed, retrying in 5s..."
        sleep 5
        "$KIND" delete cluster --name "${KIND_CLUSTER_NAME}" 2>/dev/null || true
    else
        echo "[kind-up] ERROR: Kind cluster creation failed after 3 attempts"
        exit 1
    fi
done

# Wait for cluster to be ready
echo "[kind-up] Waiting for cluster to be ready..."
if ! "$KUBECTL" wait --for=condition=Ready nodes --all --timeout=180s; then
    echo "[kind-up] ERROR: Cluster nodes did not become ready in time"
    exit 1
fi

# Show cluster info
echo "[kind-up] Cluster is ready:"
"$KUBECTL" cluster-info

echo "[kind-up] Kind cluster '${KIND_CLUSTER_NAME}' is up and ready"
