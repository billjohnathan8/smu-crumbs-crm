SHELL := /usr/bin/env bash
KIND_CLUSTER_NAME ?= cs301-crm
KUBECTL ?= kubectl
HELM ?= helm
KIND ?= kind
NULL_DEVICE ?= /dev/null
GRADLEW ?= ./gradlew
BASH ?= bash

ifeq ($(OS),Windows_NT)
NULL_DEVICE := NUL
GRADLEW := gradlew.bat
BASH := "C:/Program Files/Git/bin/bash.exe"
endif

.PHONY: kind-up infra-up build-images kind-load deploy-dev smoke

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
	cd services/backend/user-service && $(GRADLEW) clean bootJar
	cd services/backend/clients-service && $(GRADLEW) clean bootJar
	docker build -t user-service:dev services/backend/user-service
	docker build -t client-service:dev services/backend/clients-service
	docker build -t log-service:dev services/backend/log-service

kind-load:
	$(KIND) load docker-image user-service:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image client-service:dev --name $(KIND_CLUSTER_NAME)
	$(KIND) load docker-image log-service:dev --name $(KIND_CLUSTER_NAME)

deploy-dev:
	$(KUBECTL) apply -k platform/k8s/apps/overlays/dev
	$(KUBECTL) rollout restart deployment/user-service -n dev
	$(KUBECTL) rollout restart deployment/client-service -n dev
	$(KUBECTL) rollout restart deployment/log-service -n dev
	$(KUBECTL) rollout status deployment/user-service -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/client-service -n dev --timeout=180s
	$(KUBECTL) rollout status deployment/log-service -n dev --timeout=180s

smoke:
	$(BASH) ./scripts/smoke-k8s-infra.sh
