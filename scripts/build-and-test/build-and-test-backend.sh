#!/usr/bin/env bash
set -euo pipefail

HEALTHY_RUN_WINDOW_SECONDS=20

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

run_checked() {
  local error_message="$1"
  shift
  "$@" || {
    log "${error_message}"
    return 1
  }
}

requires_postgres() {
  local service_path="$1"
  local service_type="$2"
  local build_gradle="${service_path}/build.gradle"
  local application_yaml="${service_path}/src/main/resources/application.yaml"
  local requirements_txt="${service_path}/requirements.txt"
  local config_py="${service_path}/app/config.py"

  if [[ "${service_type}" == "gradle" && -f "${build_gradle}" ]] && grep -qi 'postgresql' "${build_gradle}"; then
    return 0
  fi

  if [[ "${service_type}" == "gradle" && -f "${application_yaml}" ]] && grep -Eqi 'datasource|postgresql' "${application_yaml}"; then
    return 0
  fi

  if [[ "${service_type}" == "python" && -f "${requirements_txt}" ]] && grep -Eqi 'psycopg|postgres' "${requirements_txt}"; then
    return 0
  fi

  if [[ "${service_type}" == "python" && -f "${config_py}" ]] && grep -Eqi 'DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD' "${config_py}"; then
    return 0
  fi

  return 1
}

get_service_type() {
  local service_path="$1"
  if [[ -f "${service_path}/gradlew" ]]; then
    echo "gradle"
    return 0
  fi

  if [[ -f "${service_path}/requirements.txt" && -d "${service_path}/tests" ]]; then
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

get_docker_mapped_port() {
  local container_name="$1"
  local mapping
  mapping="$(docker port "${container_name}" 8080/tcp 2>/dev/null | head -n 1 || true)"
  if [[ -z "${mapping}" ]]; then
    return 1
  fi

  echo "${mapping##*:}"
}

test_http_health_once() {
  local host_port="$1"
  local base_url="http://127.0.0.1:${host_port}"
  local path
  for path in /api/v1/health /actuator/health /health; do
    if curl -fsS --max-time 4 "${base_url}${path}" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

wait_for_container_healthy_window() {
  local container_name="$1"
  local window_seconds="${2:-20}"
  local no_health_grace_seconds="${3:-8}"
  local started elapsed running health healthy_observed
  started="$(date +%s)"
  healthy_observed=0

  while true; do
    elapsed=$(( $(date +%s) - started ))
    if (( elapsed >= window_seconds )); then
      break
    fi

    running="$(docker inspect -f '{{.State.Running}}' "${container_name}" 2>/dev/null || true)"
    if [[ "${running}" != "true" ]]; then
      return 1
    fi

    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_name}" 2>/dev/null || true)"
    if [[ "${health}" == "healthy" ]]; then
      healthy_observed=1
    elif [[ "${health}" == "unhealthy" ]]; then
      return 1
    elif [[ "${health}" == "none" && "${elapsed}" -ge "${no_health_grace_seconds}" ]]; then
      healthy_observed=1
    fi

    sleep 2
  done

  [[ "${healthy_observed}" -eq 1 ]]
}

test_docker_service_healthy() {
  local service_name="$1"
  local service_path="$2"
  local service_type="$3"
  local safe_name suffix image_tag app_container network_name db_container db_name
  local requires_pg=0

  safe_name="$(echo "${service_name}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')"
  suffix="$(date '+%Y%m%d%H%M%S')"
  image_tag="local/${safe_name}:ci-${suffix}"
  app_container="ci-${safe_name}-app-${suffix}"
  network_name="ci-${safe_name}-net-${suffix}"
  db_container="ci-${safe_name}-db-${suffix}"
  db_name="${safe_name//-/_}"

  if requires_postgres "${service_path}" "${service_type}"; then
    requires_pg=1
  fi

  cleanup() {
    docker rm -f "${app_container}" >/dev/null 2>&1 || true
    docker rm -f "${db_container}" >/dev/null 2>&1 || true
    docker network rm "${network_name}" >/dev/null 2>&1 || true
  }
  trap cleanup RETURN

  if [[ "${requires_pg}" -eq 1 ]]; then
    log "[${service_name}] Docker dependency: starting PostgreSQL sidecar"
    docker network create "${network_name}" >/dev/null
    docker run -d --name "${db_container}" --network "${network_name}" \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB="${db_name}" \
      postgres:16-alpine >/dev/null

    local db_ready=0
    local i
    for i in {1..30}; do
      if docker exec "${db_container}" pg_isready -U postgres -d "${db_name}" >/dev/null 2>&1; then
        db_ready=1
        break
      fi
      sleep 2
    done

    if [[ "${db_ready}" -eq 0 ]]; then
      log "[${service_name}] PostgreSQL sidecar did not become ready in time"
      return 1
    fi
  fi

  log "[${service_name}] Docker image build started"
  (cd "${service_path}" && docker build -t "${image_tag}" . >/dev/null)
  log "[${service_name}] Docker image build passed"

  log "[${service_name}] Docker container run started"
  if [[ "${requires_pg}" -eq 1 ]]; then
    if [[ "${service_type}" == "gradle" ]]; then
      docker run -d --name "${app_container}" --network "${network_name}" -P \
        -e "SPRING_DATASOURCE_URL=jdbc:postgresql://${db_container}:5432/${db_name}" \
        -e "SPRING_DATASOURCE_USERNAME=postgres" \
        -e "SPRING_DATASOURCE_PASSWORD=postgres" \
        "${image_tag}" >/dev/null
    elif [[ "${service_type}" == "python" ]]; then
      docker run -d --name "${app_container}" --network "${network_name}" -P \
        -e "DB_HOST=${db_container}" \
        -e "DB_PORT=5432" \
        -e "DB_NAME=${db_name}" \
        -e "DB_USER=postgres" \
        -e "DB_PASSWORD=postgres" \
        "${image_tag}" >/dev/null
    else
      log "[${service_name}] Unsupported service type for PostgreSQL wiring: ${service_type}"
      return 1
    fi
  else
    docker run -d --name "${app_container}" -P "${image_tag}" >/dev/null
  fi

  if ! wait_for_container_healthy_window "${app_container}" "${HEALTHY_RUN_WINDOW_SECONDS}" 8; then
    log "[${service_name}] Docker container health/run check failed"
    docker logs --tail 60 "${app_container}" || true
    return 1
  fi
  log "[${service_name}] Container stayed healthy/running for ${HEALTHY_RUN_WINDOW_SECONDS}s"

  local port
  if port="$(get_docker_mapped_port "${app_container}")"; then
    log "[${service_name}] Docker container exposed on localhost:${port}"
    if test_http_health_once "${port}"; then
      log "[${service_name}] HTTP health endpoint passed"
    else
      log "[${service_name}] HTTP health endpoint not detected (best-effort probe)"
    fi
  else
    log "[${service_name}] No mapped HTTP port found, container is running and stable"
  fi
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
backend_root="${repo_root}/services/backend"
gradle_user_home="${repo_root}/.gradle-user-home"

mkdir -p "${gradle_user_home}"
export GRADLE_USER_HOME="${gradle_user_home}"

if [[ ! -d "${backend_root}" ]]; then
  log "Backend services directory not found: ${backend_root}"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  log "Docker is not available or daemon is not running."
  exit 1
fi

services=()
python_services_count=0
for service_path in "${backend_root}"/*; do
  if [[ -d "${service_path}" ]]; then
    if service_type="$(get_service_type "${service_path}")"; then
      services+=("${service_type}:${service_path}")
      if [[ "${service_type}" == "python" ]]; then
        python_services_count=$((python_services_count + 1))
      fi
    fi
  fi
done

if [[ "${#services[@]}" -eq 0 ]]; then
  log "No supported backend services found under ${backend_root}"
  exit 1
fi

log "Discovered ${#services[@]} backend service(s):"
for service_entry in "${services[@]}"; do
  service_type="${service_entry%%:*}"
  service_path="${service_entry#*:}"
  service_name="$(basename "${service_path}")"
  log "  - ${service_name} [${service_type}]"
done

python_cmd=""
python_venv_root="${repo_root}/.python-build-test-venvs"
if [[ "${python_services_count}" -gt 0 ]]; then
  if ! python_cmd="$(get_python_command)"; then
    log "Python service(s) detected but no Python runtime found in PATH."
    exit 1
  fi
  mkdir -p "${python_venv_root}"
fi

for service_entry in "${services[@]}"; do
  service_type="${service_entry%%:*}"
  service_path="${service_entry#*:}"
  service_name="$(basename "${service_path}")"
  log "==> Service: ${service_name} [${service_type}]"

  if [[ "${service_type}" == "gradle" ]]; then
    log "[${service_name}] Build started"
    run_checked "[${service_name}] Build failed" bash "${service_path}/gradlew" clean assemble --no-daemon --console=plain --gradle-user-home "${gradle_user_home}"
    log "[${service_name}] Build passed"

    log "[${service_name}] Unit tests started"
    run_checked "[${service_name}] Unit tests failed" bash "${service_path}/gradlew" test --no-daemon --console=plain --gradle-user-home "${gradle_user_home}"
    log "[${service_name}] Unit tests passed"
  elif [[ "${service_type}" == "python" ]]; then
    service_venv="${python_venv_root}/${service_name}"
    service_venv_python="${service_venv}/bin/python"

    log "[${service_name}] Build started (Python environment setup)"
    run_checked "[${service_name}] Build failed" "${python_cmd}" -m venv "${service_venv}"
    run_checked "[${service_name}] Build failed" "${service_venv_python}" -m pip install --upgrade pip
    run_checked "[${service_name}] Build failed" "${service_venv_python}" -m pip install -r "${service_path}/requirements.txt"
    log "[${service_name}] Build passed"

    log "[${service_name}] Unit tests started (pytest)"
    run_checked "[${service_name}] Unit tests failed" "${service_venv_python}" -m pytest -q "${service_path}/tests"
    log "[${service_name}] Unit tests passed"
  else
    log "[${service_name}] Build failed: unsupported service type ${service_type}"
    exit 1
  fi


  if [[ ! -f "${service_path}/Dockerfile" ]]; then
    log "[${service_name}] Docker check failed: Dockerfile missing"
    exit 1
  fi

  log "[${service_name}] Docker health check started"
  run_checked "[${service_name}] Docker health check failed" test_docker_service_healthy "${service_name}" "${service_path}" "${service_type}"
  log "[${service_name}] Docker health check passed"
done

log "All backend services built, passed unit tests, and passed Docker health checks."
