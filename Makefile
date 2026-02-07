SHELL := /usr/bin/env bash
KIND_CLUSTER_NAME ?= cs301-crm
KUBECTL ?= kubectl
HELM ?= helm
KIND ?= kind
NULL_DEVICE ?= /dev/null
GRADLEW ?= ./gradlew
SMOKE_CMD ?= bash ./scripts/smoke-k8s-infra/smoke-k8s-infra.sh

ifeq ($(OS),Windows_NT)
NULL_DEVICE := NUL
GRADLEW := gradlew.bat
SMOKE_CMD := powershell -ExecutionPolicy Bypass -File scripts/smoke-k8s-infra/smoke-k8s-infra.ps1
endif

.PHONY: k8s-validate kind-up infra-up build-images kind-load deploy-dev smoke build-and-deploy-local

k8s-validate:
	tr -d '\r' < scripts/validate-k8s/validate.sh | REPO_ROOT="$$(pwd)" bash

kind-up:
	$(KIND) create cluster --name $(KIND_CLUSTER_NAME) --config platform/k8s/infra/kind-config.yaml

infra-up:
	-$(HELM) repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >$(NULL_DEVICE) 2>&1
	-$(HELM) repo add bitnami https://charts.bitnami.com/bitnami >$(NULL_DEVICE) 2>&1
	$(HELM) repo update
	$(HELM) upgrade --install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace
	$(HELM) upgrade --install metrics-server bitnami/metrics-server --namespace kube-system -f platform/k8s/infra/helm-values/metrics-server-values.yaml
	$(HELM) upgrade --install postgres bitnami/postgresql --namespace dev --create-namespace -f platform/k8s/infra/helm-values/postgresql-values.yaml
	$(KUBECTL) wait --namespace ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=180s
	$(KUBECTL) wait --namespace dev --for=condition=ready pod -l app.kubernetes.io/name=postgresql --timeout=180s

build-images:
	cd services/backend/agent && $(GRADLEW) bootJar
	cd services/backend/client && $(GRADLEW) bootJar
	cd services/backend/transaction && $(GRADLEW) bootJar
	docker build -t agent:dev services/backend/agent
	docker build -t client:dev services/backend/client
	docker build -t log:dev services/backend/log
	docker build -t transaction:dev services/backend/transaction
	docker build -t crm-ui:dev services/frontend/crm-ui

kind-load:
	$(KIND) load docker-image agent:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image client:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image log:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image transaction:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image crm-ui:dev --name $(KIND_CLUSTER_NAME)

deploy-dev:
	$(KUBECTL) apply -k platform/k8s/apps/overlays/dev
	$(KUBECTL) rollout restart deployment/agent -n dev
	$(KUBECTL) rollout restart deployment/client -n dev
	$(KUBECTL) rollout restart deployment/log -n dev
	$(KUBECTL) rollout restart deployment/transaction -n dev
	$(KUBECTL) rollout restart deployment/frontend -n dev
	$(KUBECTL) rollout status deployment/agent -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/client -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/log -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/transaction -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/frontend -n dev --timeout=180s

smoke:
	$(SMOKE_CMD)

build-and-deploy-local: k8s-validate kind-up infra-up build-images kind-load deploy-dev smoke

