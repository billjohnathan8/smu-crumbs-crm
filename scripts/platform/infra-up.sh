#!/usr/bin/env bash
set -euo pipefail

# infra-up.sh: Deploy infrastructure components (Ingress, Metrics, PostgreSQL) with retry logic
# This script is called from the Makefile to ensure bash compatibility on all platforms

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

# Use commands from common setup
KUBECTL="${KUBECTL_CMD}"
HELM="${HELM_CMD}"

echo "[infra-up] Adding helm repositories..."
# Add helm repos (ignore errors if already added)
"$HELM" repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
"$HELM" repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true

# Update helm repos with retry
for i in 1 2 3; do
    echo "[infra-up] Attempt $i/3: Updating helm repos..."
    if "$HELM" repo update; then
        echo "[infra-up] Helm repos updated successfully"
        break
    elif [ $i -lt 3 ]; then
        echo "[infra-up] Helm repo update failed, retrying in 3s..."
        sleep 3
    else
        echo "[infra-up] ERROR: Helm repo update failed after 3 attempts"
        exit 1
    fi
done

# Deploy ingress-nginx
echo "[infra-up] Deploying ingress-nginx..."
"$HELM" upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --timeout 5m \
    --wait

# Deploy metrics-server
echo "[infra-up] Deploying metrics-server..."
"$HELM" upgrade --install metrics-server bitnami/metrics-server \
    --namespace kube-system \
    -f platform/k8s/infra/helm-values/metrics-server-values.yaml \
    --timeout 5m \
    --wait

# Deploy PostgreSQL
echo "[infra-up] Deploying PostgreSQL..."
"$HELM" upgrade --install postgres bitnami/postgresql \
    --namespace dev \
    --create-namespace \
    -f platform/k8s/infra/helm-values/postgresql-values.yaml \
    --timeout 5m \
    --wait

# Wait for pods to be ready
echo "[infra-up] Waiting for ingress-nginx controller to be ready..."
"$KUBECTL" wait --namespace ingress-nginx \
    --for=condition=ready pod \
    -l app.kubernetes.io/component=controller \
    --timeout=180s

echo "[infra-up] Waiting for PostgreSQL to be ready..."
"$KUBECTL" wait --namespace dev \
    --for=condition=ready pod \
    -l app.kubernetes.io/name=postgresql \
    --timeout=180s

echo "[infra-up] Infrastructure deployment completed successfully"
