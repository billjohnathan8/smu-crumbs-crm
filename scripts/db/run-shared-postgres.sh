#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ACTION="${1:-}"

if [[ -n "${ACTION}" && "${ACTION}" != "-h" && "${ACTION}" != "--help" && "${ACTION}" != "help" ]]; then
  : "${LOCAL_DB_PASSWORD:?Missing LOCAL_DB_PASSWORD (repo root .env.local — see .env.example)}"
fi

LOCAL_DB_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-crm}"
LOCAL_DB_USER="${LOCAL_DB_USER:-crm_app}"
DB_DOCKER_NETWORK="${DB_DOCKER_NETWORK:-}"

USER_BASE_URL="${USER_BASE_URL:-http://127.0.0.1:18081}"
ROOT_ADMIN_EMAIL="${ROOT_ADMIN_EMAIL:-admin@crm.com}"
ROOT_ADMIN_PASSWORD="${ROOT_ADMIN_PASSWORD:-}"
SEED_USER_EMAIL="${SEED_USER_EMAIL:-agent1@crm.com}"
SEED_AGENT_PASSWORD="${SEED_AGENT_PASSWORD:-}"

FLYWAY_IMAGE="${FLYWAY_IMAGE:-flyway/flyway:10}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"

DB_CONNECT_HOST="${LOCAL_DB_HOST}"
DOCKER_NETWORK_ARGS=()
DOCKER_HOSTMAP_ARGS=()

if [[ "${LOCAL_DB_HOST,,}" == *"rds.amazonaws.com"* || "${LOCAL_DB_HOST,,}" == *".amazonaws.com"* ]]; then
  echo "[FAIL] LOCAL_DB_HOST points to an AWS endpoint (${LOCAL_DB_HOST}). This script is for local/CI ephemeral DBs only." >&2
  exit 1
fi

if [[ -n "${DB_DOCKER_NETWORK}" ]]; then
  DOCKER_NETWORK_ARGS=(--network "${DB_DOCKER_NETWORK}")
elif [[ "${LOCAL_DB_HOST}" == "localhost" || "${LOCAL_DB_HOST}" == "127.0.0.1" ]]; then
  # Prefer local compose network when the standard local Postgres container exists.
  if command -v docker >/dev/null 2>&1 && docker inspect crm-postgres >/dev/null 2>&1; then
    DB_DOCKER_NETWORK="$(
      docker inspect -f '{{range $name, $cfg := .NetworkSettings.Networks}}{{println $name}}{{end}}' crm-postgres \
        | head -n 1 \
        | tr -d '\r'
    )"
    if [[ -n "${DB_DOCKER_NETWORK}" ]]; then
      DB_CONNECT_HOST="crm-postgres"
      DOCKER_NETWORK_ARGS=(--network "${DB_DOCKER_NETWORK}")
    fi
  fi

  if [[ ${#DOCKER_NETWORK_ARGS[@]} -eq 0 ]]; then
    # Fallback for host-local DB endpoints.
    DB_CONNECT_HOST="host.docker.internal"
    DOCKER_HOSTMAP_ARGS=(--add-host "host.docker.internal:host-gateway")
  fi
fi

usage() {
  cat <<'EOF'
Usage:
  bash scripts/db/run-shared-postgres.sh <command>

Commands:
  migrate       Run schema migrations for user/client/transaction/log.
  seed          Seed baseline users via user-service API (idempotent).
  verify        Verify required schema objects and migration histories.
  verify-seed   Verify seeded principals exist.
  reset         Drop and recreate the public schema (destructive for local/test DB).
  bootstrap     Run migrate + seed + verify + verify-seed.

Supported env overrides:
  LOCAL_DB_HOST, LOCAL_DB_PORT, LOCAL_DB_NAME, LOCAL_DB_USER, LOCAL_DB_PASSWORD
  DB_DOCKER_NETWORK   (for DB hosts reachable only inside a Docker network)
  USER_BASE_URL, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD
  SEED_USER_EMAIL, SEED_AGENT_PASSWORD
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[FAIL] Required command not found: ${cmd}" >&2
    exit 1
  fi
}

docker_run_with_retry() {
  local stderr_log
  local rc
  local tmp_docker_config

  stderr_log="$(mktemp 2>/dev/null || echo "/tmp/docker-run-stderr.$$")"
  if MSYS_NO_PATHCONV=1 docker "$@" 2> >(tee "${stderr_log}" >&2); then
    rm -f "${stderr_log}"
    return 0
  fi
  rc=$?

  if [[ -n "${DOCKER_CONFIG:-}" ]] || ! grep -qi "error getting credentials" "${stderr_log}"; then
    rm -f "${stderr_log}"
    return "${rc}"
  fi

  tmp_docker_config="$(mktemp -d 2>/dev/null || echo "/tmp/docker-config.$$")"
  echo "[WARN] Docker credential helper failed. Retrying with temporary DOCKER_CONFIG." >&2
  if MSYS_NO_PATHCONV=1 DOCKER_CONFIG="${tmp_docker_config}" docker "$@"; then
    rm -rf "${tmp_docker_config}" "${stderr_log}"
    return 0
  fi

  rc=$?
  rm -rf "${tmp_docker_config}" "${stderr_log}"
  return "${rc}"
}


db_psql() {
  local sql="$1"
  docker_run_with_retry run --rm \
    "${DOCKER_NETWORK_ARGS[@]}" \
    "${DOCKER_HOSTMAP_ARGS[@]}" \
    -e "PGPASSWORD=${LOCAL_DB_PASSWORD}" \
    "${POSTGRES_IMAGE}" \
    psql -X -v ON_ERROR_STOP=1 -qtA \
      -h "${DB_CONNECT_HOST}" \
      -p "${LOCAL_DB_PORT}" \
      -U "${LOCAL_DB_USER}" \
      -d "${LOCAL_DB_NAME}" \
      -c "${sql}"
}

run_flyway_migration() {
  local service_name="$1"
  local migrations_dir="$2"
  local history_table="$3"

  echo "[migrate] ${service_name} (${history_table})"
  docker_run_with_retry run --rm \
    "${DOCKER_NETWORK_ARGS[@]}" \
    "${DOCKER_HOSTMAP_ARGS[@]}" \
    -v "${migrations_dir}:/flyway/sql:ro" \
    "${FLYWAY_IMAGE}" \
    -url="jdbc:postgresql://${DB_CONNECT_HOST}:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}" \
    -user="${LOCAL_DB_USER}" \
    -password="${LOCAL_DB_PASSWORD}" \
    -locations="filesystem:/flyway/sql" \
    -baselineOnMigrate=true \
    -baselineVersion=0 \
    -table="${history_table}" \
    -connectRetries=20 \
    migrate
}

migrate_log_service() {
  local migrations_dir
  local file_path
  local version
  local exists

  migrations_dir="${ROOT_DIR}/services/backend/log/app/migrations"
  echo "[migrate] log (schema_migrations)"

  db_psql "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(128) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  "

  while IFS= read -r file_path; do
    version="$(basename "${file_path}")"
    if ! exists="$(db_psql "SELECT 1 FROM schema_migrations WHERE version='${version}' LIMIT 1;")"; then
      echo "[FAIL] Could not check schema_migrations for ${version}" >&2
      exit 1
    fi
    exists="$(echo "${exists}" | tr -d '[:space:]')"
    if [[ "${exists}" == "1" ]]; then
      continue
    fi

    echo "  [log] applying ${version}"
    docker_run_with_retry run --rm \
      "${DOCKER_NETWORK_ARGS[@]}" \
      "${DOCKER_HOSTMAP_ARGS[@]}" \
      -e "PGPASSWORD=${LOCAL_DB_PASSWORD}" \
      -v "${file_path}:/tmp/migration.sql:ro" \
      "${POSTGRES_IMAGE}" \
      psql -X -v ON_ERROR_STOP=1 \
        -h "${DB_CONNECT_HOST}" \
        -p "${LOCAL_DB_PORT}" \
        -U "${LOCAL_DB_USER}" \
        -d "${LOCAL_DB_NAME}" \
        -f /tmp/migration.sql

    if ! db_psql "INSERT INTO schema_migrations(version) VALUES ('${version}');" >/dev/null; then
      echo "[FAIL] Could not record applied migration ${version} in schema_migrations" >&2
      exit 1
    fi
  done < <(find "${migrations_dir}" -maxdepth 1 -type f -name '*.sql' | sort)

  echo "  [log] migrations complete"
}

migrate_all() {
  require_command docker
  run_flyway_migration \
    "user" \
    "${ROOT_DIR}/services/backend/user/src/main/resources/db/migration" \
    "user_flyway_schema_history"
  run_flyway_migration \
    "client" \
    "${ROOT_DIR}/services/backend/client/src/main/resources/db/migration" \
    "client_flyway_schema_history"
  run_flyway_migration \
    "transaction" \
    "${ROOT_DIR}/services/backend/transaction/src/main/resources/db/migration" \
    "transaction_flyway_schema_history"
  migrate_log_service
  echo "[OK] Shared Postgres migrations completed."
}

seed_data() {
  if [[ -z "${ROOT_ADMIN_PASSWORD:-}" || -z "${SEED_AGENT_PASSWORD:-}" ]]; then
    echo "[FAIL] ROOT_ADMIN_PASSWORD and SEED_AGENT_PASSWORD must be set (e.g. export E2E_ADMIN_PASSWORD and E2E_USER_PASSWORD; see repo root .env.example)." >&2
    exit 1
  fi

  local login_response
  local admin_access_token
  local create_status
  local create_body
  local seed_response_file
  local max_attempts
  local last_http_code

  max_attempts=10
  last_http_code=""

  retry_http_post() {
    local url="$1"
    local data="$2"
    local auth_header="${3:-}"
    local output_file="${4:-}"
    local attempt
    local http_code
    local curl_exit
    local tmp_output

    tmp_output="${output_file}"
    if [[ -z "${tmp_output}" ]]; then
      tmp_output="$(mktemp 2>/dev/null || echo "/tmp/db-seed-http.$$")"
    fi

    for attempt in $(seq 1 "${max_attempts}"); do
      if [[ -n "${auth_header}" ]]; then
        http_code="$(
          curl --silent --show-error \
            --output "${tmp_output}" \
            --write-out "%{http_code}" \
            --request POST "${url}" \
            --header "Content-Type: application/json" \
            --header "Authorization: Bearer ${auth_header}" \
            --data "${data}" \
            || true
        )"
      else
        http_code="$(
          curl --silent --show-error \
            --output "${tmp_output}" \
            --write-out "%{http_code}" \
            --request POST "${url}" \
            --header "Content-Type: application/json" \
            --data "${data}" \
            || true
        )"
      fi
      curl_exit=$?

      if [[ ${curl_exit} -eq 0 && ( "${http_code}" == "200" || "${http_code}" == "201" || "${http_code}" == "409" ) ]]; then
        last_http_code="${http_code}"
        echo "${http_code}"
        return 0
      fi

      # Retry on transport failures and transient upstream instability.
      if [[ ${curl_exit} -ne 0 || "${http_code}" == "000" || "${http_code}" == "429" || "${http_code}" == "502" || "${http_code}" == "503" || "${http_code}" == "504" ]]; then
        sleep 1
        continue
      fi

      last_http_code="${http_code}"
      echo "${http_code}"
      return 0
    done

    last_http_code="${http_code}"
    echo "${http_code}"
    return 1
  }

  require_command curl
  seed_response_file="$(mktemp 2>/dev/null || echo "/tmp/db-seed-user-create.$$")"

  echo "[seed] root admin login (also triggers root admin bootstrap when missing)"
  local login_response_file
  local login_status
  login_response_file="$(mktemp 2>/dev/null || echo "/tmp/db-seed-user-login.$$")"

  login_status="$(retry_http_post "${USER_BASE_URL}/api/auth/login" "{\"email\":\"${ROOT_ADMIN_EMAIL}\",\"password\":\"${ROOT_ADMIN_PASSWORD}\"}" "" "${login_response_file}")" || true
  if [[ "${login_status}" != "200" ]]; then
    echo "[FAIL] Root admin login failed while seeding baseline principals (HTTP ${login_status:-${last_http_code:-unknown}})." >&2
    if [[ -f "${login_response_file}" ]]; then
      cat "${login_response_file}" >&2 || true
    fi
    rm -f "${seed_response_file}" "${login_response_file}"
    exit 1
  fi

  login_response="$(cat "${login_response_file}")"

  # Extract accessToken using sed — no Python dependency required.
  admin_access_token="$(echo "${login_response}" | sed 's/.*"accessToken":"\([^"]*\)".*/\1/')"

  create_body="$(
    cat <<EOF
{
  "firstName": "CI",
  "lastName": "User",
  "email": "${SEED_USER_EMAIL}",
  "role": "user",
  "temporaryPassword": "${SEED_AGENT_PASSWORD}"
}
EOF
  )"

  create_status="$(retry_http_post "${USER_BASE_URL}/api/users" "${create_body}" "${admin_access_token}" "${seed_response_file}")" || true
  rm -f "${login_response_file}"

  case "${create_status}" in
    201)
      echo "[seed] Created baseline user: ${SEED_USER_EMAIL}"
      ;;
    409)
      echo "[seed] Baseline user already exists: ${SEED_USER_EMAIL}"
      ;;
    *)
      echo "[FAIL] Unexpected response while seeding baseline user (HTTP ${create_status:-${last_http_code:-unknown}})." >&2
      if [[ -f "${seed_response_file}" ]]; then
        cat "${seed_response_file}" >&2 || true
      fi
      exit 1
      ;;
  esac

  rm -f "${seed_response_file}"
  echo "[OK] Seed flow completed."
}

assert_table_exists() {
  local table_name="$1"
  local exists
  exists="$(db_psql "SELECT CASE WHEN to_regclass('public.${table_name}') IS NULL THEN '0' ELSE '1' END;")"
  exists="$(echo "${exists}" | tr -d '[:space:]')"
  if [[ "${exists}" != "1" ]]; then
    echo "[FAIL] Required table not found: ${table_name}" >&2
    exit 1
  fi
}

assert_history_non_empty() {
  local table_name="$1"
  local count
  count="$(db_psql "SELECT COUNT(*) FROM ${table_name};")"
  count="$(echo "${count}" | tr -d '[:space:]')"
  if [[ -z "${count}" || "${count}" == "0" ]]; then
    echo "[FAIL] Migration history table has no applied rows: ${table_name}" >&2
    exit 1
  fi
}

verify_schema() {
  require_command docker

  echo "[verify] Checking required stateful tables"
  assert_table_exists "users"
  assert_table_exists "refresh_tokens"
  assert_table_exists "clients"
  assert_table_exists "accounts"
  assert_table_exists "transaction_import_batches"
  assert_table_exists "transaction_records"
  assert_table_exists "logs"
  assert_table_exists "audit_logs"
  assert_table_exists "communications"
  assert_table_exists "aml_alerts"

  echo "[verify] Checking migration history tables"
  assert_table_exists "user_flyway_schema_history"
  assert_table_exists "client_flyway_schema_history"
  assert_table_exists "transaction_flyway_schema_history"
  assert_table_exists "schema_migrations"

  assert_history_non_empty "user_flyway_schema_history"
  assert_history_non_empty "client_flyway_schema_history"
  assert_history_non_empty "transaction_flyway_schema_history"
  assert_history_non_empty "schema_migrations"

  echo "[OK] Schema verification completed."
}

verify_seed() {
  require_command docker
  local root_count
  local seed_count

  root_count="$(db_psql "SELECT COUNT(*) FROM users WHERE lower(email)=lower('${ROOT_ADMIN_EMAIL}');")"
  root_count="$(echo "${root_count}" | tr -d '[:space:]')"
  if [[ -z "${root_count}" || "${root_count}" == "0" ]]; then
    echo "[FAIL] Root admin seed is missing: ${ROOT_ADMIN_EMAIL}" >&2
    exit 1
  fi

  seed_count="$(db_psql "SELECT COUNT(*) FROM users WHERE lower(email)=lower('${SEED_USER_EMAIL}');")"
  seed_count="$(echo "${seed_count}" | tr -d '[:space:]')"
  if [[ -z "${seed_count}" || "${seed_count}" == "0" ]]; then
    echo "[FAIL] Baseline seed user is missing: ${SEED_USER_EMAIL}" >&2
    exit 1
  fi

  echo "[OK] Seed verification completed."
}

reset_db() {
  require_command docker
  echo "[reset] Dropping and recreating schema public in ${LOCAL_DB_NAME}"
  db_psql "DROP SCHEMA IF EXISTS public CASCADE;"
  db_psql "CREATE SCHEMA public;"
  db_psql "GRANT ALL ON SCHEMA public TO ${LOCAL_DB_USER};"
  db_psql "GRANT ALL ON SCHEMA public TO public;"
  echo "[OK] Local/test DB schema reset completed."
}

bootstrap_all() {
  migrate_all
  seed_data
  verify_schema
  verify_seed
}

case "${ACTION}" in
  migrate)
    migrate_all
    ;;
  seed)
    seed_data
    ;;
  verify)
    verify_schema
    ;;
  verify-seed)
    verify_seed
    ;;
  reset)
    reset_db
    ;;
  bootstrap)
    bootstrap_all
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
