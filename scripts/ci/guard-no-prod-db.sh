#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

scan_paths=()
if [[ "$#" -gt 0 ]]; then
  for rel in "$@"; do
    scan_paths+=("$rel")
  done
else
  scan_paths=(
    "docker-compose.localstack.yml"
    "scripts/ci/fullstack-integration.compose.yml"
    "scripts/ci/run-fullstack-integration-e2e.sh"
    ".github/workflows/reusable-test-component-db.yml"
    ".github/workflows/reusable-fullstack-integration.yml"
    "services/backend/agent/.env.example"
    "services/backend/client/.env.example"
    "services/backend/transaction/.env.example"
    "services/backend/log/.env.example"
    "README.md"
    "docs/configuration.md"
    "docs/infrastructure/localstack-setup.md"
    "docs/onboarding/new-dev-setup.md"
    "docs/testing/TESTING-GUIDE.md"
  )
fi

existing_paths=()
for rel in "${scan_paths[@]}"; do
  abs_path="${ROOT_DIR}/${rel}"
  if [[ -e "${abs_path}" ]]; then
    existing_paths+=("${abs_path}")
  fi
done

if [[ "${#existing_paths[@]}" -eq 0 ]]; then
  echo "[FAIL] No scan paths exist."
  exit 1
fi

search_pattern() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -n -i "${pattern}" "${existing_paths[@]}" || true
  else
    grep -n -i -E -- "${pattern}" "${existing_paths[@]}" || true
  fi
}

# 1) Block obvious production-like DB endpoint values when tied to DB config keys.
db_key_pattern='(DB_HOST|LOCAL_DB_HOST|DB_URL|DATABASE_URL|SPRING_DATASOURCE_URL|SPRING_R2DBC_URL|PGHOST|POSTGRES_HOST|POSTGRES_URL|JDBC_DATABASE_URL)'
unsafe_host_pattern='(rds\.amazonaws\.com|[A-Za-z0-9.-]+\.rds\.amazonaws\.com|amazonaws\.com)'

key_hits="$(search_pattern "${db_key_pattern}[^\n]*${unsafe_host_pattern}")"

# 2) Block direct Postgres URLs to AWS endpoints even without explicit key names.
url_hits="$(search_pattern '(jdbc:postgresql://|postgresql://|postgres://)[^[:space:]"'"'"']*(rds\.amazonaws\.com|amazonaws\.com)')"

if [[ -n "${key_hits}" || -n "${url_hits}" ]]; then
  echo "[FAIL] Production-like DB endpoint detected in local/CI configuration paths."
  if [[ -n "${key_hits}" ]]; then
    echo ""
    echo "Matches by DB key pattern:"
    echo "${key_hits}"
  fi
  if [[ -n "${url_hits}" ]]; then
    echo ""
    echo "Matches by DB URL pattern:"
    echo "${url_hits}"
  fi
  exit 1
fi

echo "[OK] No production-like DB endpoints found in configured local/CI paths."
