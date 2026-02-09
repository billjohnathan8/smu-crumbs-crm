# CI Hardening: Flaky infrastructure operations (kind create, helm repo update, docker pulls)
# are retried up to 3 times with brief delays to avoid wasting CI minutes on transient failures.
SHELL := /usr/bin/env bash
KIND_CLUSTER_NAME ?= cs301-crm
NULL_DEVICE ?= /dev/null
GRADLEW ?= ./gradlew

# Ensure portable .devtools/bin tools are on PATH for all recipes
ifneq ($(wildcard .devtools/bin),)
export PATH := $(CURDIR)/.devtools/bin:$(PATH)
endif

# Add Windows tool paths for WSL/Git Bash environments to find kubectl, helm, kind, etc.
# Check if we're in WSL (common in Windows dev workflows)
ifneq ($(wildcard /mnt/c/ProgramData/chocolatey/bin),)
export PATH := /mnt/c/ProgramData/chocolatey/bin:$(PATH)
endif
# Check if we're in Git Bash/MINGW
ifneq ($(wildcard /c/ProgramData/chocolatey/bin),)
export PATH := /c/ProgramData/chocolatey/bin:$(PATH)
endif

# Tool discovery: Simplified to rely on PATH
# Tools should be available via .devtools/bin, chocolatey, or system PATH
KUBECTL ?= kubectl
HELM ?= helm
KIND ?= kind

SMOKE_INFRA_CMD ?= bash ./scripts/smoke-k8s-infra/smoke-k8s-infra.sh
SMOKE_PROBES_CMD ?= bash ./scripts/smoke-k8s-infra/smoke-probes.sh
# Python command: Try python3 first (Linux/macOS), fall back to python (Windows)
PYTHON ?= $(shell command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python)
VALIDATE_K8S_CMD ?= $(PYTHON) scripts/validate-k8s/validate.py
NS ?= dev

ifeq ($(OS),Windows_NT)
NULL_DEVICE := NUL
GRADLEW := gradlew.bat
SMOKE_INFRA_CMD := powershell -ExecutionPolicy Bypass -File scripts/smoke-k8s-infra/smoke-k8s-infra.ps1
SMOKE_PROBES_CMD := powershell -ExecutionPolicy Bypass -File scripts/smoke-k8s-infra/smoke-probes.ps1
VALIDATE_K8S_CMD := python scripts/validate-k8s/validate.py
KIND_UP_CMD := python scripts/platform/kind-up.py
PREPULL_CMD := python scripts/platform/prepull-infra-images.py
INFRA_UP_CMD := python scripts/platform/infra-up.py
else
KIND_UP_CMD := $(PYTHON) scripts/platform/kind-up.py
PREPULL_CMD := $(PYTHON) scripts/platform/prepull-infra-images.py
INFRA_UP_CMD := $(PYTHON) scripts/platform/infra-up.py

# Verbose mode support (Linux/macOS)
ifdef VERBOSE
PREPULL_CMD := $(PYTHON) scripts/platform/prepull-infra-images.py --verbose
INFRA_UP_CMD := $(PYTHON) scripts/platform/infra-up.py --verbose
endif
endif

.PHONY: k8s-validate kind-up kind-down kind-reset prepull-infra-images infra-up build-images kind-load deploy-dev smoke-infra smoke-probes smoke build-and-deploy-local build-and-deploy-local-fast build-and-deploy-local-no-prepull build-and-deploy-local-verbose

k8s-validate:
	$(VALIDATE_K8S_CMD)

kind-up:
	$(KIND_UP_CMD)

kind-down:
	$(KIND) delete cluster --name $(KIND_CLUSTER_NAME)

kind-reset: kind-down kind-up

prepull-infra-images:
	$(PREPULL_CMD)

infra-up:
	$(INFRA_UP_CMD)

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

smoke-infra:
	$(SMOKE_INFRA_CMD)

smoke-probes:
	$(SMOKE_PROBES_CMD) $(NS)

smoke: smoke-infra smoke-probes

build-and-deploy-local: k8s-validate kind-up prepull-infra-images infra-up build-images kind-load deploy-dev smoke

build-and-deploy-local-fast: k8s-validate kind-up prepull-infra-images infra-up build-images kind-load deploy-dev smoke

build-and-deploy-local-no-prepull: k8s-validate kind-up infra-up build-images kind-load deploy-dev smoke

build-and-deploy-local-verbose:
	$(MAKE) build-and-deploy-local VERBOSE=1

