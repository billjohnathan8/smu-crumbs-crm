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

# Deploy ingress-nginx with extended timeout and retry logic
# Note: ingress-nginx image is ~800MB-1GB; first pull can exceed 5m on slower networks
echo "[infra-up] Deploying ingress-nginx..."
for i in 1 2; do
    echo "[infra-up] Attempt $i/2: Installing ingress-nginx..."
    if "$HELM" upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --timeout 10m \
        --wait; then
        echo "[infra-up] Ingress-nginx deployed successfully"
        break
    elif [ $i -lt 2 ]; then
        echo "[infra-up] Ingress-nginx deployment failed, retrying in 5s..."
        echo "[infra-up] (This may be due to slow image pull on first deployment)"
        sleep 5
    else
        echo "[infra-up] ERROR: Ingress-nginx deployment failed after 2 attempts"
        exit 1
    fi
done

# Deploy metrics-server with retry logic
echo "[infra-up] Deploying metrics-server..."
for i in 1 2; do
    echo "[infra-up] Attempt $i/2: Installing metrics-server..."
    if "$HELM" upgrade --install metrics-server bitnami/metrics-server \
        --namespace kube-system \
        -f platform/k8s/infra/helm-values/metrics-server-values.yaml \
        --timeout 7m \
        --wait; then
        echo "[infra-up] Metrics-server deployed successfully"
        break
    elif [ $i -lt 2 ]; then
        echo "[infra-up] Metrics-server deployment failed, retrying in 5s..."
        sleep 5
    else
        echo "[infra-up] ERROR: Metrics-server deployment failed after 2 attempts"
        exit 1
    fi
done

# Deploy PostgreSQL with retry logic
echo "[infra-up] Deploying PostgreSQL..."
for i in 1 2; do
    echo "[infra-up] Attempt $i/2: Installing PostgreSQL..."
    if "$HELM" upgrade --install postgres bitnami/postgresql \
        --namespace dev \
        --create-namespace \
        -f platform/k8s/infra/helm-values/postgresql-values.yaml \
        --timeout 7m \
        --wait; then
        echo "[infra-up] PostgreSQL deployed successfully"
        break
    elif [ $i -lt 2 ]; then
        echo "[infra-up] PostgreSQL deployment failed, retrying in 5s..."
        sleep 5
    else
        echo "[infra-up] ERROR: PostgreSQL deployment failed after 2 attempts"
        exit 1
    fi
done

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
