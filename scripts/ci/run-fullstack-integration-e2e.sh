#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
LOG_DIR="${ROOT_DIR}/build-logs/fullstack-integration"
FRONTEND_DIR="${ROOT_DIR}/services/frontend/crm-ui"

PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:18088}"
COMPOSE_PROJECT_NAME="crm-fullstack-it-${GITHUB_RUN_ID:-local}-$$"

mkdir -p "${LOG_DIR}"

dump_compose_logs() {
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" logs --no-color \
    > "${LOG_DIR}/docker-compose.log" 2>&1 || true
}

cleanup() {
  local exit_code=$?
  dump_compose_logs
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
    >> "${LOG_DIR}/docker-compose.log" 2>&1 || true

  if [[ ${exit_code} -ne 0 ]]; then
    echo "Fullstack integration failed. Logs saved to ${LOG_DIR}/docker-compose.log"
  fi
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  local name="$2"
  local max_attempts="${3:-60}"

  for ((attempt=1; attempt<=max_attempts; attempt++)); do
    if curl --silent --show-error --fail "${url}" >/dev/null; then
      echo "[ready] ${name}: ${url}"
      return 0
    fi
    sleep 2
  done

  echo "[timeout] ${name} did not become ready: ${url}"
  return 1
}

build_java_jar() {
  local service_dir="$1"
  local service_name="$2"
  pushd "${service_dir}" >/dev/null
  chmod +x gradlew
  ./gradlew bootJar --no-daemon --console=plain \
    > "${LOG_DIR}/${service_name}-bootjar.log" 2>&1
  popd >/dev/null
}

echo "Building backend artifacts used by Docker images..."
build_java_jar "${ROOT_DIR}/services/backend/agent" "agent"
build_java_jar "${ROOT_DIR}/services/backend/client" "client"
build_java_jar "${ROOT_DIR}/services/backend/transaction" "transaction"

echo "Starting containerized fullstack integration environment..."
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
  >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" up -d --build \
  >> "${LOG_DIR}/docker-compose.log" 2>&1

wait_for_http "http://127.0.0.1:18081/health" "agent-service"
wait_for_http "http://127.0.0.1:18082/health" "client-service"
wait_for_http "http://127.0.0.1:18083/health" "transaction-service"
wait_for_http "http://127.0.0.1:18084/health" "log-service"
wait_for_http "http://127.0.0.1:18085/health" "frontend"
wait_for_http "${PLAYWRIGHT_BASE_URL}/health" "integration-gateway"

echo "Running real backend-frontend integration Playwright tests..."
pushd "${FRONTEND_DIR}" >/dev/null
PLAYWRIGHT_EXTERNAL_BASE_URL=true \
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin123}" \
E2E_AGENT_PASSWORD="${E2E_AGENT_PASSWORD:-AgentPass123!}" \
npx playwright test e2e/integration --workers=1
popd >/dev/null

echo "Fullstack containerized integration tests passed."
