#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
log_dir="${repo_root}/build-logs/build-and-test-frontend"
year="$(date '+%Y')"
month="$(date '+%m')"
day="$(date '+%d')"
hour="$(date '+%H')"
minute="$(date '+%M')"
second="$(date '+%S')"
timestamp_readable="$(date '+%Y-%m-%d_%H-%M-%S')"
inverse_timestamp="$(printf '%04d%02d%02d-%02d%02d%02d' \
  "$((9999 - 10#${year}))" \
  "$((12 - 10#${month}))" \
  "$((31 - 10#${day}))" \
  "$((23 - 10#${hour}))" \
  "$((59 - 10#${minute}))" \
  "$((59 - 10#${second}))")"
script_name="$(basename "${BASH_SOURCE[0]%.*}")"
log_file="${log_dir}/inv${inverse_timestamp}__${timestamp_readable}__${script_name}.log"

mkdir -p "${log_dir}"

rotate_logs() {
  local files
  files="$(ls -1t "${log_dir}"/*.log 2>/dev/null | tail -n +4 2>/dev/null || true)"
  if [[ -n "${files}" ]]; then
    while IFS= read -r file; do
      [[ -n "${file}" ]] && rm -f -- "${file}" || true
    done <<< "${files}"
  fi
}
trap rotate_logs EXIT

exec > >(tee -a "${log_file}") 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

log "Build log file: ${log_file}"

get_node_command() {
  if command -v node >/dev/null 2>&1; then
    echo "node"
    return 0
  fi
  return 1
}

get_npm_command() {
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return 0
  fi
  return 1
}

frontend_root="${repo_root}/services/frontend/crm-ui"

if [[ ! -d "${frontend_root}" ]]; then
  log "Frontend directory not found: ${frontend_root}"
  exit 1
fi

if ! node_cmd="$(get_node_command)"; then
  log "Node.js not found in PATH. Please install Node.js."
  exit 1
fi

if ! npm_cmd="$(get_npm_command)"; then
  log "npm not found in PATH. Please install npm."
  exit 1
fi

log "Node version: $("${node_cmd}" --version)"
log "npm version: $("${npm_cmd}" --version)"

log "==> Frontend: crm-ui"
log "Location: ${frontend_root}"

has_failures=0

cd "${frontend_root}"

# Step 1: Install dependencies
log "[crm-ui] Installing dependencies (npm install)..."
if "${npm_cmd}" install; then
  log "[crm-ui] Dependencies installed successfully"
else
  log "[crm-ui] npm install failed"
  has_failures=1
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 2: Type checking
  log "[crm-ui] Running type checking (npm run typecheck)..."
  if "${npm_cmd}" run typecheck; then
    log "[crm-ui] Type checking passed"
  else
    log "[crm-ui] Type checking failed"
    has_failures=1
  fi
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 3: Linting
  log "[crm-ui] Running linter (npm run lint)..."
  if "${npm_cmd}" run lint; then
    log "[crm-ui] Linting passed"
  else
    log "[crm-ui] Linting failed"
    has_failures=1
  fi
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 4: Format check
  log "[crm-ui] Running format check (npm run format:check)..."
  if "${npm_cmd}" run format:check; then
    log "[crm-ui] Format check passed"
  else
    log "[crm-ui] Format check failed"
    has_failures=1
  fi
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 5: Build
  log "[crm-ui] Building application (npm run build)..."
  if "${npm_cmd}" run build; then
    log "[crm-ui] Build successful"
  else
    log "[crm-ui] Build failed"
    has_failures=1
  fi
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 6: Run tests with coverage
  log "[crm-ui] Running tests with coverage (npm run test:coverage)..."
  if "${npm_cmd}" run test:coverage; then
    log "[crm-ui] Tests passed"
  else
    log "[crm-ui] Tests failed"
    has_failures=1
  fi
fi

if [[ "${has_failures}" -eq 0 ]]; then
  # Step 7: Run end-to-end tests
  log "[crm-ui] Running end-to-end tests (npm run e2e)..."
  if "${npm_cmd}" run e2e; then
    log "[crm-ui] E2E tests passed"
  else
    log "[crm-ui] E2E tests failed"
    has_failures=1
  fi
fi

echo
log "Frontend local test pipeline summary"
if [[ "${has_failures}" -eq 1 ]]; then
  log "Status: FAIL"
else
  log "Status: PASS"
  log "[crm-ui] Local pipeline passed"
fi

# Generate aggregated report index
report_index_generator="${repo_root}/scripts/build-and-test-frontend/generate-frontend-index.py"
if [[ -f "${report_index_generator}" ]]; then
  python_cmd=""
  for candidate in python python3 py; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      python_cmd="${candidate}"
      break
    fi
  done

  if [[ -n "${python_cmd}" ]]; then
    log "Generating aggregated test report index..."
    BUILD_LOG_DIR="${log_dir}" "${python_cmd}" "${report_index_generator}" || {
      log "Report index generation failed (exitCode=$?)"
    }
  else
    log "Skipping aggregated report index generation: Python not available."
  fi
fi

echo
log "All test reports aggregated at:"
log "  - HTML: ${log_dir}/index.html"
log "  - Open in browser: file://${log_dir}/index.html"

echo
log "Individual reports:"
log "  - Vitest coverage: ${frontend_root}/coverage/index.html"
log "  - Playwright e2e: ${frontend_root}/playwright-report/index.html"

if [[ "${has_failures}" -eq 1 ]]; then
  log "Frontend local pipeline checks failed."
  exit 1
fi

log "Frontend passed lint, build, tests, coverage, and e2e tests."
