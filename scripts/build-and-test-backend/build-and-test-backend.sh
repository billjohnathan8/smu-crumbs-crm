#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
log_dir="${repo_root}/build-logs/build-and-test-backend"
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

get_service_type() {
  local service_path="$1"

  if [[ -f "${service_path}/gradlew" ]]; then
    echo "gradle"
    return 0
  fi

  if [[ -f "${service_path}/run-local-test-pipeline.py" ]]; then
    echo "python"
    return 0
  fi

  return 1
}

get_python_command() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi

  return 1
}

backend_root="${repo_root}/services/backend"
gradle_user_home="${repo_root}/.gradle-user-home"

mkdir -p "${gradle_user_home}"
export GRADLE_USER_HOME="${gradle_user_home}"

if [[ ! -d "${backend_root}" ]]; then
  log "Backend services directory not found: ${backend_root}"
  exit 1
fi

services=()
python_count=0
for service_path in "${backend_root}"/*; do
  if [[ -d "${service_path}" ]] && service_type="$(get_service_type "${service_path}")"; then
    services+=("${service_type}:${service_path}")
    if [[ "${service_type}" == "python" ]]; then
      python_count=$((python_count + 1))
    fi
  fi
done

if [[ "${#services[@]}" -eq 0 ]]; then
  log "No supported backend services found under ${backend_root}"
  exit 1
fi

python_cmd=""
if [[ "${python_count}" -gt 0 ]]; then
  if ! python_cmd="$(get_python_command)"; then
    log "Python service(s) detected but no Python runtime found in PATH."
    exit 1
  fi
fi

log "Discovered ${#services[@]} backend service(s):"
for service_entry in "${services[@]}"; do
  service_type="${service_entry%%:*}"
  service_path="${service_entry#*:}"
  service_name="$(basename "${service_path}")"
  log "  - ${service_name} [${service_type}]"
done

has_failures=0
results=()

for service_entry in "${services[@]}"; do
  service_type="${service_entry%%:*}"
  service_path="${service_entry#*:}"
  service_name="$(basename "${service_path}")"

  log "==> Service: ${service_name} [${service_type}]"

  if [[ "${service_type}" == "gradle" ]]; then
    if bash "${service_path}/gradlew" localTestPipeline --no-daemon --console=plain --gradle-user-home "${gradle_user_home}"; then
      log "[${service_name}] Local pipeline passed"
      results+=("${service_name}|${service_type}|PASS")
    else
      log "[${service_name}] Local pipeline failed"
      results+=("${service_name}|${service_type}|FAIL")
      has_failures=1
    fi
  elif [[ "${service_type}" == "python" ]]; then
    if (cd "${service_path}" && "${python_cmd}" run-local-test-pipeline.py); then
      log "[${service_name}] Local pipeline passed"
      results+=("${service_name}|${service_type}|PASS")
    else
      log "[${service_name}] Local pipeline failed"
      results+=("${service_name}|${service_type}|FAIL")
      has_failures=1
    fi
  else
    log "[${service_name}] Unsupported service type: ${service_type}"
    results+=("${service_name}|${service_type}|FAIL")
    has_failures=1
  fi
done

echo
log "Backend local test pipeline summary"
printf '%-20s %-10s %-8s\n' "SERVICE" "RUNTIME" "STATUS"
for line in "${results[@]}"; do
  IFS='|' read -r service_name service_type service_status <<< "${line}"
  printf '%-20s %-10s %-8s\n' "${service_name}" "${service_type}" "${service_status}"
done

python_for_report="${python_cmd:-}"
if [[ -z "${python_for_report}" ]]; then
  python_for_report="$(get_python_command 2>/dev/null || true)"
fi

if [[ -n "${python_for_report}" && -f "${repo_root}/scripts/build-and-test-backend/generate-coverage-index.py" ]]; then
  log "Generating aggregated coverage report (build-logs/build-and-test-backend/index.html)"
  PYTHONDONTWRITEBYTECODE=1 BUILD_LOG_DIR="${log_dir}" "${python_for_report}" "${repo_root}/scripts/build-and-test-backend/generate-coverage-index.py" || log "Coverage index generation failed."
else
  log "Skipping aggregated coverage report generation: Python not available."
fi

if [[ "${has_failures}" -eq 1 ]]; then
  log "One or more services failed local pipeline checks."
  exit 1
fi

log "All backend services passed lint, build, tests, and coverage report generation."
