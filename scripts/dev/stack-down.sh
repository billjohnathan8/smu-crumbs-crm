#!/usr/bin/env bash
# scripts/dev/stack-down.sh
#
# Tear down the local dev stack started by stack-up.sh.
#
# Usage (from repo root):
#   bash scripts/dev/stack-down.sh
#
# Environment variables:
#   AGGRESSIVE_PRUNE=1   Also prune stopped containers and unused networks system-wide
#                        (volumes are never pruned to protect data from other projects)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
COMPOSE_PROJECT="crm-fullstack-it-local"
LOG_DIR="${ROOT_DIR}/build-logs/dev-stack"
AGGRESSIVE_PRUNE="${AGGRESSIVE_PRUNE:-0}"

mkdir -p "${LOG_DIR}"

echo "Tearing down stack..."
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" down -v --remove-orphans

remove_localstack_lambda_containers() {
  local max_attempts=6
  local attempt=1
  local had_leftovers=0

  while (( attempt <= max_attempts )); do
    mapfile -t leftover_ids < <(docker ps -aq --filter "name=crm-fullstack-it-" 2>/dev/null || true)
    if (( ${#leftover_ids[@]} == 0 )); then
      if (( had_leftovers == 0 )); then
        echo "  [OK] No Lambda containers to clean up"
      else
        echo "  [OK] Lambda containers removed"
      fi
      return 0
    fi

    had_leftovers=1
    echo "  Attempt ${attempt}/${max_attempts}: removing ${#leftover_ids[@]} Lambda container(s)..."
    for container_id in "${leftover_ids[@]}"; do
      docker rm -f "${container_id}" >> "${LOG_DIR}/cleanup.log" 2>&1 || true
    done

    sleep 1
    ((attempt++))
  done

  mapfile -t remaining_ids < <(docker ps -aq --filter "name=crm-fullstack-it-" 2>/dev/null || true)
  if (( ${#remaining_ids[@]} > 0 )); then
    echo "  [FAIL] ${#remaining_ids[@]} Lambda container(s) still remain after cleanup attempts."
    echo "  [INFO] Remaining containers:"
    docker ps -a --filter "name=crm-fullstack-it-" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}"
    return 1
  fi

  echo "  [OK] Lambda containers removed"
  return 0
}

# Clean up Lambda execution containers created by LocalStack.
echo "Cleaning up Lambda containers..."
remove_localstack_lambda_containers

# Optional aggressive pruning (disabled by default to avoid affecting other Docker projects)
if [[ "${AGGRESSIVE_PRUNE}" == "1" ]]; then
  echo "Performing aggressive Docker cleanup (AGGRESSIVE_PRUNE=1)..."
  docker container prune -f >> "${LOG_DIR}/cleanup.log" 2>&1 || true
  docker network prune -f >> "${LOG_DIR}/cleanup.log" 2>&1 || true
  echo "  [OK] Aggressive cleanup complete (stopped containers + unused networks)"
  echo "  [INFO] Volume cleanup skipped to preserve data from other projects"
fi

echo "[OK] Stack torn down"
