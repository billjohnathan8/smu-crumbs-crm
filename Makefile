NULL_DEVICE ?= /dev/null
GRADLEW ?= ./gradlew

# Ensure portable .devtools/bin tools are on PATH for all recipes
ifneq ($(wildcard .devtools/bin),)
export PATH := $(CURDIR)/.devtools/bin:$(PATH)
endif

ifeq ($(OS),Windows_NT)
NULL_DEVICE ?= NUL
GRADLEW ?= gradlew.bat
PYTHON ?= python
else
SHELL ?= /usr/bin/env bash
PYTHON ?= $(shell command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python)
endif

.PHONY: build-images inframap inframap-full terraform-graph

build-images:
	cd services/backend/agent && $(GRADLEW) bootJar
	cd services/backend/client && $(GRADLEW) bootJar
	cd services/backend/transaction && $(GRADLEW) bootJar
	docker build -t agent:dev services/backend/agent
	docker build -t client:dev services/backend/client
	docker build -t transaction:dev services/backend/transaction
	docker build -t crm-ui:dev services/frontend/crm-ui

inframap:
	$(PYTHON) scripts/pipelines/generate_inframap.py --install-portable

inframap-full:
	$(PYTHON) scripts/pipelines/generate_inframap.py --full-graph --source platform/terraform --basename terraform-full

terraform-graph:
	$(PYTHON) scripts/pipelines/generate_terraform_graph.py
