#!/usr/bin/env bash
# scripts/dev/stack-down.sh
#
# Tear down the local dev stack started by stack-up.sh.
#
# Usage (from repo root):
#   bash scripts/dev/stack-down.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
COMPOSE_PROJECT="crm-fullstack-it-local"

docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" down -v --remove-orphans
echo "[OK] Stack torn down"
