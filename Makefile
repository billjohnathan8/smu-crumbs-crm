SHELL ?= /usr/bin/env bash
NULL_DEVICE ?= /dev/null
GRADLEW ?= ./gradlew

# Ensure portable .devtools/bin tools are on PATH for all recipes
ifneq ($(wildcard .devtools/bin),)
export PATH := $(CURDIR)/.devtools/bin:$(PATH)
endif

# Python command: Use python (not python3) when in Git Bash on Windows to avoid WindowsApps stub
ifdef MSYSTEM
PYTHON ?= python
else
PYTHON ?= $(shell command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python)
endif

ifeq ($(OS),Windows_NT)
NULL_DEVICE ?= NUL
GRADLEW ?= gradlew.bat
endif

.PHONY: build-images

build-images:
	cd services/backend/agent && $(GRADLEW) bootJar
	cd services/backend/client && $(GRADLEW) bootJar
	cd services/backend/transaction && $(GRADLEW) bootJar
	docker build -t agent:dev services/backend/agent
	docker build -t client:dev services/backend/client
	docker build -t log:dev services/backend/log
	docker build -t transaction:dev services/backend/transaction
	docker build -t crm-ui:dev services/frontend/crm-ui
