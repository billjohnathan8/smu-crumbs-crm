#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
LOG_ROOT="${ROOT_DIR}/build-logs/fullstack-integration"
FRONTEND_DIR="${ROOT_DIR}/services/frontend/crm-ui"
INTEGRATION_TEST_DIR="${ROOT_DIR}/tests/integration"
DB_ORCHESTRATOR_SCRIPT="${ROOT_DIR}/scripts/db/run-shared-postgres.sh"
DB_ENDPOINT_GUARD_SCRIPT="${ROOT_DIR}/scripts/ci/guard-no-prod-db.sh"
TRANSACTION_GENERATOR_SCRIPT="${ROOT_DIR}/services/backend/transaction/mock-sftp/mock_transactions.py"

PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:18088}"
COMPOSE_PROJECT_NAME="crm-fullstack-it-${GITHUB_RUN_ID:-local}"
FULLSTACK_MODE="${FULLSTACK_MODE:-full}" # full | pr | smoke
FULLSTACK_LOCAL_DOCKER_PRUNE="${FULLSTACK_LOCAL_DOCKER_PRUNE:-1}"
case "${FULLSTACK_MODE}" in
  full|pr|smoke) ;;
  *)
    echo "[FAIL] FULLSTACK_MODE must be 'full', 'pr', or 'smoke' (got: ${FULLSTACK_MODE})" >&2
    exit 1
    ;;
esac

PLAYWRIGHT_CRITICAL_PR_SPECS=(
  "cross-agent-data-isolation.spec.ts"
  "verification-workflow-contract.spec.ts"
  "user-management-advanced.spec.ts"
)
PLAYWRIGHT_SCOPE_LABEL="full suite"
PLAYWRIGHT_SPEC_ARGS=()
if [[ "${FULLSTACK_MODE}" == "pr" ]]; then
  PLAYWRIGHT_SCOPE_LABEL="critical PR subset"
  PLAYWRIGHT_SPEC_ARGS=("${PLAYWRIGHT_CRITICAL_PR_SPECS[@]}")
fi
if [[ -n "${PLAYWRIGHT_SPEC_ARGS_OVERRIDE:-}" ]]; then
  PLAYWRIGHT_SCOPE_LABEL="override subset"
  read -r -a PLAYWRIGHT_SPEC_ARGS <<< "${PLAYWRIGHT_SPEC_ARGS_OVERRIDE}"
fi

SCRIPT_START_TS="$(date +%s)"
CURRENT_PHASE_NAME=""
CURRENT_PHASE_START_TS=0

# Fake creds - LocalStack accepts any non-empty value
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_PAGER=""
export LOCAL_DB_HOST="${LOCAL_DB_HOST:-postgres}"
export LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
export LOCAL_DB_HOST_PORT="${LOCAL_DB_HOST_PORT:-15432}"
export LOCAL_DB_NAME="${LOCAL_DB_NAME:-crm}"
export LOCAL_DB_USER="${LOCAL_DB_USER:-crm_app}"
export LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-devpassword}"
LOCALSTACK_ENDPOINT="http://127.0.0.1:14566"
LOG_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-log-service"
LOG_HTTP_API_NAME="scroogebank-crm-dev-log-http-api-it"
LOG_HTTP_API_STAGE="local"
LOG_LAMBDA_RUNTIME="${LOG_LAMBDA_RUNTIME:-python3.12}"
VERIFICATION_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-verification"
VERIFICATION_LAMBDA_RUNTIME="${VERIFICATION_LAMBDA_RUNTIME:-python3.12}"
SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME="scroogebank-crm-dev-sftp-transaction-collector"
SFTP_TRANSACTION_COLLECTOR_RUNTIME="${SFTP_TRANSACTION_COLLECTOR_RUNTIME:-python3.12}"
AML_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-aml"
AML_LAMBDA_RUNTIME="${AML_LAMBDA_RUNTIME:-python3.12}"
AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-audit-consumer"
AUDIT_CONSUMER_LAMBDA_RUNTIME="${AUDIT_CONSUMER_LAMBDA_RUNTIME:-python3.12}"
AUDIT_CONSUMER_QUEUE_NAME="scroogebank-crm-dev-audit"
AUDIT_CONSUMER_TABLE_NAME="scroogebank-crm-dev-audit-logs"
AML_CONSUMER_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-aml-consumer"
AML_CONSUMER_LAMBDA_RUNTIME="${AML_CONSUMER_LAMBDA_RUNTIME:-python3.12}"
AML_CONSUMER_QUEUE_NAME="scroogebank-crm-dev-aml"
AML_CONSUMER_TABLE_NAME="scroogebank-crm-dev-aml-reports"
VERIFICATION_SNS_TOPIC_NAME="scroogebank-crm-dev-verification"
export VERIFICATION_EMAIL_PROVIDER="${VERIFICATION_EMAIL_PROVIDER:-mock}"
export SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-verification@crm.local}"
export VERIFICATION_DOCUMENTS_BUCKET="${VERIFICATION_DOCUMENTS_BUCKET:-scroogebank-crm-dev-verification}"
export VERIFICATION_SNS_TOPIC_ARN="${VERIFICATION_SNS_TOPIC_ARN:-arn:aws:sns:ap-southeast-1:000000000000:${VERIFICATION_SNS_TOPIC_NAME}}"

# Set safe defaults so compose parsing works for `down` before dynamic provisioning.
export LOG_SERVICE_URL="${LOG_SERVICE_URL:-http://localstack:4566}"
export CLIENT_LOG_SERVICE_URL="${CLIENT_LOG_SERVICE_URL:-${LOG_SERVICE_URL}}"
export LOG_API_UPSTREAM="${LOG_API_UPSTREAM:-http://localstack:4566}"

prune_old_log_runs() {
  local keep="$1"
  local entries=()

  mkdir -p "${LOG_ROOT}"
  find "${LOG_ROOT}" -mindepth 1 -maxdepth 1 ! -type d -exec rm -f {} +

  while IFS= read -r entry; do
    if [[ "${entry}" =~ ^[0-9]{8}_[0-9]{6}-[0-9]+$ ]]; then
      entries+=("${entry}")
    else
      rm -rf "${LOG_ROOT}/${entry}"
    fi
  done < <(find "${LOG_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)

  if [[ "${#entries[@]}" -le "${keep}" ]]; then
    return
  fi

  for old_entry in "${entries[@]:${keep}}"; do
    rm -rf "${LOG_ROOT}/${old_entry}"
  done
}

prune_old_log_runs 2
RUN_ID="$(date +%Y%m%d_%H%M%S)-$$"
LOG_DIR="${LOG_ROOT}/${RUN_ID}"
mkdir -p "${LOG_DIR}"

start_phase() {
  local phase_name="$1"
  echo ""
  echo "=== ${phase_name} ==="
  CURRENT_PHASE_NAME="${phase_name}"
  CURRENT_PHASE_START_TS="$(date +%s)"
}

end_phase() {
  if [[ -n "${CURRENT_PHASE_NAME}" ]]; then
    local phase_end_ts elapsed
    phase_end_ts="$(date +%s)"
    elapsed=$((phase_end_ts - CURRENT_PHASE_START_TS))
    echo "[timing] ${CURRENT_PHASE_NAME}: ${elapsed}s"
    CURRENT_PHASE_NAME=""
  fi
}

# Detect a working Python interpreter.
# On Windows/Git Bash, `python3` may resolve to the broken Microsoft Store stub.
if command -v python3 >/dev/null 2>&1 \
  && python3 -c "import sys; sys.exit(0)" 2>/dev/null \
  && python3 -m pip --version >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1 \
  && python -c "import sys; sys.exit(0)" 2>/dev/null \
  && python -m pip --version >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "[FAIL] No working Python interpreter with pip found (python3 or python)" >&2
  exit 1
fi

# Detect AWS CLI in bash/WSL. Prefer Linux aws, then aws.exe interop.
if command -v aws >/dev/null 2>&1; then
  AWS_CMD="aws"
elif command -v aws.exe >/dev/null 2>&1; then
  AWS_CMD="aws.exe"
elif [ -x "/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then
  AWS_CMD="/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe"
else
  echo "[FAIL] AWS CLI not found in bash/WSL environment." >&2
  echo "       Install in WSL (sudo apt install -y awscli) or ensure aws.exe is discoverable from bash." >&2
  exit 1
fi

AWS_IS_WINDOWS=false
AWS_VERSION_STR="$("${AWS_CMD}" --version 2>&1 || true)"
if echo "${AWS_VERSION_STR}" | grep -qi "windows/"; then
  AWS_IS_WINDOWS=true
fi

# Convert a Unix path to a Windows path for the Windows AWS CLI.
# Tries cygpath (Git Bash), then wslpath (WSL), then manual /mnt/X → X: fallback.
to_windows_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p" 2>/dev/null || {
      # wslpath failed (e.g. file not yet visible in WSL mount); manual fallback
      if [[ "$p" =~ ^/mnt/([a-zA-Z])/(.*) ]]; then
        echo "${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
      else
        echo "$p"
      fi
    }
  elif [[ "$p" =~ ^/mnt/([a-zA-Z])/(.*) ]]; then
    echo "${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
  else
    echo "$p"
  fi
}

require_docker_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[FAIL] Docker CLI not found in PATH." >&2
    echo "       Install Docker Desktop (or Docker Engine + Compose v2), then re-run." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "[FAIL] Docker Compose v2 is unavailable ('docker compose')." >&2
    echo "       Install/enable Docker Compose v2, then re-run." >&2
    exit 1
  fi

  local docker_info_err=""
  if ! docker_info_err="$(docker info 2>&1 >/dev/null)"; then
    echo "[FAIL] Docker daemon is not reachable." >&2
    if echo "${docker_info_err}" | grep -q "dockerDesktopLinuxEngine"; then
      echo "       Detected missing Docker Desktop Linux engine pipe (//./pipe/dockerDesktopLinuxEngine)." >&2
    fi
    echo "       Start Docker Desktop and ensure it is fully running, then re-run." >&2
    if [[ -n "${docker_info_err}" ]]; then
      echo "       docker info: ${docker_info_err}" >&2
    fi
    exit 1
  fi
}

dump_compose_logs() {
  {
    echo ""
    echo "----- docker compose logs (cleanup snapshot) -----"
  } >> "${LOG_DIR}/docker-compose.log"
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" logs --no-color \
    >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
}

aws_local() {
  "${AWS_CMD}" --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 "$@"
}

aws_local_s3_put_object() {
  local bucket="$1"
  local key="$2"
  local body_path="$3"
  local source_path="${body_path}"

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    source_path="$(to_windows_path "${body_path}")"
  fi

  aws_local s3 cp "${source_path}" "s3://${bucket}/${key}" \
    >/dev/null
}

generate_contract_transaction_csv() {
  local output_path="$1"
  local row_count="$2"
  local seed="$3"
  local start_transaction_id="$4"
  local start_date="$5"
  local end_date="$6"
  local client_ids="$7"

  "${PYTHON_CMD}" "${TRANSACTION_GENERATOR_SCRIPT}" \
    --output "${output_path}" \
    --row-count "${row_count}" \
    --seed "${seed}" \
    --start-transaction-id "${start_transaction_id}" \
    --start-date "${start_date}" \
    --end-date "${end_date}" \
    --client-ids "${client_ids}" \
    --client-id-mode sequential
}

normalize_text() {
  echo "$1" | tr -d '\r'
}

localstack_queue_exists() {
  local queue_name="$1"

  if aws_local sqs get-queue-url --queue-name "${queue_name}" >/dev/null 2>&1; then
    return 0
  fi

  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" exec -T localstack \
    awslocal sqs get-queue-url --queue-name "${queue_name}" --region ap-southeast-1 \
    >/dev/null 2>&1
}

wait_for_dynamodb_item_pk_sk() {
  local table_name="$1"
  local pk="$2"
  local sk="$3"
  local attempts="${4:-30}"
  local key_json=""
  local result=""

  key_json="$(printf '{"pk":{"S":"%s"},"sk":{"S":"%s"}}' "${pk}" "${sk}")"

  for i in $(seq 1 "${attempts}"); do
    result="$(
      aws_local dynamodb get-item \
        --table-name "${table_name}" \
        --key "${key_json}" \
        --query "Item.pk.S" \
        --output text 2>/dev/null || true
    )"
    result="$(normalize_text "${result}")"
    if [[ "${result}" == "${pk}" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[FAIL] Timed out waiting for item pk=${pk} sk=${sk} in table ${table_name}" >&2
  exit 1
}

dynamodb_count_by_pk() {
  local table_name="$1"
  local pk="$2"
  local expr_values=""
  local count=""
  expr_values="$(printf '{":pk":{"S":"%s"}}' "${pk}")"
  count="$(
    aws_local dynamodb query \
      --table-name "${table_name}" \
      --key-condition-expression "pk = :pk" \
      --expression-attribute-values "${expr_values}" \
      --query "Count" \
      --output text 2>/dev/null || true
  )"
  normalize_text "${count}"
}

wait_for_queue_drained() {
  local queue_url="$1"
  local attempts="${2:-30}"
  local consecutive_zero_required="${3:-3}"
  local consecutive_zero=0
  local visible=0
  local not_visible=0

  for i in $(seq 1 "${attempts}"); do
    visible="$(
      aws_local sqs get-queue-attributes \
        --queue-url "${queue_url}" \
        --attribute-names ApproximateNumberOfMessages \
        --query "Attributes.ApproximateNumberOfMessages" \
        --output text 2>/dev/null || true
    )"
    visible="$(normalize_text "${visible}")"
    not_visible="$(
      aws_local sqs get-queue-attributes \
        --queue-url "${queue_url}" \
        --attribute-names ApproximateNumberOfMessagesNotVisible \
        --query "Attributes.ApproximateNumberOfMessagesNotVisible" \
        --output text 2>/dev/null || true
    )"
    not_visible="$(normalize_text "${not_visible}")"

    if [[ "${visible}" == "0" && "${not_visible}" == "0" ]]; then
      consecutive_zero=$((consecutive_zero + 1))
      if [[ ${consecutive_zero} -ge ${consecutive_zero_required} ]]; then
        return 0
      fi
    else
      consecutive_zero=0
    fi
    sleep 1
  done

  echo "[FAIL] Queue did not drain in time (visible=${visible}, notVisible=${not_visible})" >&2
  exit 1
}

require_docker_ready

if [[ -f "${DB_ENDPOINT_GUARD_SCRIPT}" ]]; then
  bash "${DB_ENDPOINT_GUARD_SCRIPT}"
fi

cleanup() {
  local exit_code=$?
  end_phase
  dump_compose_logs

  # Skip cleanup if SKIP_FULLSTACK_CLEANUP is set (used by test_all.py pipeline)
  if [[ "${SKIP_FULLSTACK_CLEANUP:-}" == "1" ]]; then
    echo "[INFO] Skipping stack cleanup (SKIP_FULLSTACK_CLEANUP=1)"
    echo "       Stack remains running for subsequent performance tests"
  else
    docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
      >> "${LOG_DIR}/docker-compose.log" 2>&1 || true

    if [[ "${GITHUB_ACTIONS:-}" != "true" && "${FULLSTACK_LOCAL_DOCKER_PRUNE}" == "1" ]]; then
      local leftover_ids=""
      leftover_ids="$(docker ps -aq --filter "name=crm-fullstack-it-" 2>/dev/null || true)"
      if [[ -n "${leftover_ids}" ]]; then
        docker rm -f ${leftover_ids} >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
      fi
      docker container prune -f >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
      docker volume prune -f >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
      docker network prune -f >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
      docker system prune -af --volumes >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
    fi
  fi

  local total_elapsed
  total_elapsed=$(( $(date +%s) - SCRIPT_START_TS ))
  echo "[timing] total-runtime: ${total_elapsed}s (mode=${FULLSTACK_MODE})"

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

wait_for_jobs() {
  local failed=0
  while [[ $# -gt 0 ]]; do
    local pid="$1"
    local name="$2"
    shift 2
    if wait "${pid}"; then
      echo "[OK] ${name}"
    else
      echo "[FAIL] ${name}" >&2
      failed=1
    fi
  done
  return "${failed}"
}

start_base_infra() {
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
    >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" up -d --build \
    postgres localstack \
    >> "${LOG_DIR}/docker-compose.log" 2>&1
}

build_java_jar() {
  local service_dir="$1"
  local service_name="$2"
  local gradle_user_home="${service_dir}/.gradle-local"
  local java_runtime_is_windows=false

  detect_windows_java_runtime() {
    java -XshowSettings:properties -version 2>&1 | grep -q "os.name = Windows"
  }

  # On WSL, 'java' may not be on PATH while a Windows JDK is installed.
  # Probe known Windows install locations using globbing (safe for spaces).
  if ! command -v java >/dev/null 2>&1; then
    local _jh=""
    local _patterns=(
      "/mnt/c/Users/*/AppData/Local/Programs/Eclipse Adoptium/jdk-*/bin/java.exe"
      "/mnt/c/Program Files/Eclipse Adoptium/jdk-*/bin/java.exe"
      "/mnt/c/Program Files/Java/jdk-*/bin/java.exe"
      "/mnt/c/Program Files/Microsoft/jdk-*/bin/java.exe"
    )
    for _pattern in "${_patterns[@]}"; do
      while IFS= read -r _candidate; do
        if [ -x "${_candidate}" ]; then
          _jh="${_candidate%/bin/java.exe}"
          export JAVA_HOME="${_jh}"
          export PATH="${_jh}/bin:${PATH}"
          java_runtime_is_windows=true
          break 2
        fi
      done < <(compgen -G "${_pattern}")
    done
  fi

  if command -v java >/dev/null 2>&1 && detect_windows_java_runtime; then
    java_runtime_is_windows=true
  fi

  pushd "${service_dir}" >/dev/null
  chmod +x gradlew
  local gradle_log="${LOG_DIR}/${service_name}-bootjar.log"

  # When bash resolves `java` to a Windows JVM, Unix wrapper paths (e.g. /mnt/c/...)
  # fail with "Unable to access jarfile". Use the Windows wrapper directly.
  # Exception: Git Bash (MSYSTEM set, e.g. MINGW64) handles Windows JVM paths
  # correctly via MSYS path translation, so ./gradlew works and is preferred.
  # cmd.exe /c "gradlew.bat" from Git Bash spawns Gradle's single-use daemon as a
  # detached process — cmd.exe exits with code 0 immediately while the build runs
  # in the background, so the JAR is never present when Docker builds the image.
  local is_git_bash=false
  [[ -n "${MSYSTEM:-}" ]] && is_git_bash=true

  if [[ "${java_runtime_is_windows}" == "true" ]] \
    && [[ "${is_git_bash}" == "false" ]] \
    && command -v cmd.exe >/dev/null 2>&1 \
    && [ -f "./gradlew.bat" ]; then
    if ! cmd.exe /c "gradlew.bat bootJar --no-daemon --console=plain" \
      > "${gradle_log}" 2>&1; then
      popd >/dev/null
      return 1
    fi
  elif ! GRADLE_USER_HOME="${gradle_user_home}" ./gradlew bootJar --no-daemon --console=plain > "${gradle_log}" 2>&1; then
    # Retry with Gradle Windows wrapper when Java path/tooling mismatch is detected.
    if grep -Eq "JAVA_HOME|Unable to access jarfile" "${gradle_log}" \
      && command -v cmd.exe >/dev/null 2>&1 \
      && [ -f "./gradlew.bat" ]; then
      if ! cmd.exe /c "gradlew.bat bootJar --no-daemon --console=plain" \
        > "${gradle_log}" 2>&1; then
        popd >/dev/null
        return 1
      fi
    else
      popd >/dev/null
      return 1
    fi
  fi
  popd >/dev/null
}

run_gradle_db_test() {
  local service_name="$1"
  local service_dir="$2"
  local test_selector="$3"
  local db_name="$4"
  local include_integration="${5:-false}"
  local gradle_log="${LOG_DIR}/${service_name}-db-tests.log"
  local gradle_user_home="${service_dir}/.gradle-local"
  local db_jdbc_url="jdbc:postgresql://127.0.0.1:${LOCAL_DB_HOST_PORT}/${db_name}"
  local gradle_args=(
    cleanTest
    test
    --tests "${test_selector}"
    --no-daemon
    --console=plain
  )
  local base_env=(
    APP_ENV=test
    AUTH_MODE=local
    JWT_HMAC_SECRET=dev-only-insecure-secret
    APP_JWT_HMAC_SECRET=dev-only-insecure-secret
    APP_MOCK_SFTP_ROOT=build/mock-sftp
    APP_CLIENT_SERVICE_URL=http://localhost:8080
    DB_HOST=127.0.0.1
    DB_PORT="${LOCAL_DB_HOST_PORT}"
    DB_NAME="${db_name}"
    DB_USER="${LOCAL_DB_USER}"
    DB_PASSWORD="${LOCAL_DB_PASSWORD}"
    PGHOST=127.0.0.1
    PGPORT="${LOCAL_DB_HOST_PORT}"
    PGDATABASE="${db_name}"
    PGUSER="${LOCAL_DB_USER}"
    PGPASSWORD="${LOCAL_DB_PASSWORD}"
    SPRING_DATASOURCE_URL="${db_jdbc_url}"
    SPRING_DATASOURCE_USERNAME="${LOCAL_DB_USER}"
    SPRING_DATASOURCE_PASSWORD="${LOCAL_DB_PASSWORD}"
    SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
  )
  local simple_selector="${test_selector##*.}"

  if [[ "${include_integration}" == "true" ]]; then
    gradle_args+=(-PincludeIntegration=true)
  fi

  pushd "${service_dir}" >/dev/null
  chmod +x gradlew

  if env "${base_env[@]}" \
    GRADLE_USER_HOME="${gradle_user_home}" \
    ./gradlew "${gradle_args[@]}" > "${gradle_log}" 2>&1; then
    popd >/dev/null
    return 0
  fi

  # Retry with Gradle Windows wrapper when Java path/tooling mismatch is detected.
  # On WSL with a Windows JVM, ./gradlew fails with "Unable to access jarfile"
  # because the JVM can't resolve /mnt/c/... paths. gradlew.bat uses native paths.
  local should_retry_windows=false
  if grep -Eq "JAVA_HOME|Unable to access jarfile" "${gradle_log}"; then
    should_retry_windows=true
  elif grep -q "No tests found for given includes" "${gradle_log}"; then
    # Some local shells can pass selector args differently across wrappers.
    should_retry_windows=true
    echo "[WARN] ${service_name} reported no matching tests with Unix Gradle wrapper; retrying with Windows wrapper." >&2
  fi

  if [[ "${should_retry_windows}" == "true" ]] \
    && command -v cmd.exe >/dev/null 2>&1 \
    && [ -f "./gradlew.bat" ]; then
    local win_gradle_user_home="${gradle_user_home}"
    local win_cmd_wrapper="${service_dir}/.gradle-db-test-${service_name}.cmd"
    local win_cmd_wrapper_path=""
    win_gradle_user_home="$(to_windows_path "${win_gradle_user_home}")"
    {
      echo "@echo off"
      for kv in "${base_env[@]}"; do
        echo "set \"${kv}\""
      done
      echo "set \"GRADLE_USER_HOME=${win_gradle_user_home}\""
      echo "call gradlew.bat ${gradle_args[*]}"
      echo "exit /b %ERRORLEVEL%"
    } > "${win_cmd_wrapper}"
    win_cmd_wrapper_path="$(to_windows_path "${win_cmd_wrapper}")"
    if cmd.exe /c "${win_cmd_wrapper_path}" > "${gradle_log}" 2>&1; then
      rm -f "${win_cmd_wrapper}"
      popd >/dev/null
      return 0
    fi
    rm -f "${win_cmd_wrapper}"
  fi

  # Retry selector once by simple class-name wildcard to tolerate package moves
  # while still targeting the same DB test class used in CI.
  if grep -q "No tests found for given includes" "${gradle_log}"; then
    local wildcard_selector="*${simple_selector}"
    local wildcard_args=(
      cleanTest
      test
      --tests "${wildcard_selector}"
      --no-daemon
      --console=plain
    )
    if [[ "${include_integration}" == "true" ]]; then
      wildcard_args+=(-PincludeIntegration=true)
    fi
    if env "${base_env[@]}" \
      GRADLE_USER_HOME="${gradle_user_home}" \
      ./gradlew "${wildcard_args[@]}" > "${gradle_log}" 2>&1; then
      popd >/dev/null
      return 0
    fi
  fi

  popd >/dev/null
  echo "[FAIL] ${service_name} DB test command failed. See ${gradle_log}" >&2
  return 1
}

recreate_component_test_db() {
  local db_name="$1"
  local terminate_output=""
  local drop_output=""
  local create_output=""

  if [[ ! "${db_name}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "[FAIL] Invalid DB name for component tests: ${db_name}" >&2
    return 1
  fi

  echo "  [db-check] Preparing isolated database: ${db_name}"

  if ! terminate_output="$(
    docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "${LOCAL_DB_USER}" -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db_name}' AND pid <> pg_backend_pid();" \
      2>&1
  )"; then
    echo "[FAIL] Unable to terminate active DB connections for ${db_name}" >&2
    [[ -n "${terminate_output}" ]] && echo "${terminate_output}" >&2
    return 1
  fi

  if ! drop_output="$(
    docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "${LOCAL_DB_USER}" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${db_name}\";" \
      2>&1
  )"; then
    echo "[FAIL] Unable to drop existing DB ${db_name}" >&2
    [[ -n "${drop_output}" ]] && echo "${drop_output}" >&2
    return 1
  fi

  if echo "${drop_output}" | grep -q "does not exist"; then
    echo "  [db-check] No prior database to drop: ${db_name}"
  else
    echo "  [db-check] Dropped existing database: ${db_name}"
  fi

  if ! create_output="$(
    docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "${LOCAL_DB_USER}" -d postgres \
      -c "CREATE DATABASE \"${db_name}\" OWNER \"${LOCAL_DB_USER}\";" \
      2>&1
  )"; then
    echo "[FAIL] Unable to create DB ${db_name}" >&2
    [[ -n "${create_output}" ]] && echo "${create_output}" >&2
    return 1
  fi

  echo "  [db-check] Created database: ${db_name}"
}

run_db_backed_component_tests() {
  local log_service_dir="${ROOT_DIR}/services/backend/log"
  local log_db_test_log="${LOG_DIR}/log-db-tests.log"
  local log_db_venv_dir="${log_service_dir}/.venv-fullstack-db-tests"
  local log_db_python=""
  local user_test_db="${LOCAL_DB_NAME}_it_user"
  local client_test_db="${LOCAL_DB_NAME}_it_client"
  local transaction_test_db="${LOCAL_DB_NAME}_it_transaction"
  local log_test_db="${LOCAL_DB_NAME}_it_log"

  echo "Running DB-backed checks against postgres://127.0.0.1:${LOCAL_DB_HOST_PORT} (isolated per-service DBs)"

  recreate_component_test_db "${user_test_db}"
  run_gradle_db_test \
    "user" \
    "${ROOT_DIR}/services/backend/user" \
    "com.scroogebank.crm.user_service.service.PersistentUserStoreTest" \
    "${user_test_db}"

  recreate_component_test_db "${client_test_db}"
  run_gradle_db_test \
    "client" \
    "${ROOT_DIR}/services/backend/client" \
    "com.scroogebank.crm.client_service.ClientsServiceIT" \
    "${client_test_db}" \
    true

  recreate_component_test_db "${transaction_test_db}"
  run_gradle_db_test \
    "transaction" \
    "${ROOT_DIR}/services/backend/transaction" \
    "com.scroogebank.crm.transaction_service.service.PersistentTransactionsStoreTest" \
    "${transaction_test_db}"

  pushd "${log_service_dir}" >/dev/null
  : > "${log_db_test_log}"

  # Use an isolated virtualenv to mirror CI's ephemeral Python environment and
  # avoid system-managed pip restrictions on Debian/Ubuntu (PEP 668).
  if ! ${PYTHON_CMD} -m venv "${log_db_venv_dir}" >> "${log_db_test_log}" 2>&1; then
    popd >/dev/null
    echo "[FAIL] log DB test virtualenv creation failed. See ${log_db_test_log}" >&2
    return 1
  fi

  if [[ -x "${log_db_venv_dir}/bin/python" ]]; then
    log_db_python="${log_db_venv_dir}/bin/python"
  elif [[ -x "${log_db_venv_dir}/Scripts/python.exe" ]]; then
    log_db_python="${log_db_venv_dir}/Scripts/python.exe"
  elif [[ -x "${log_db_venv_dir}/Scripts/python" ]]; then
    log_db_python="${log_db_venv_dir}/Scripts/python"
  else
    popd >/dev/null
    echo "[FAIL] log DB test virtualenv python executable not found. See ${log_db_test_log}" >&2
    return 1
  fi

  if ! "${log_db_python}" -m pip install -r requirements.txt >> "${log_db_test_log}" 2>&1; then
    popd >/dev/null
    echo "[FAIL] log DB test dependency install failed. See ${log_db_test_log}" >&2
    return 1
  fi

  recreate_component_test_db "${log_test_db}"
  if ! RUN_DB_INTEGRATION_TESTS=true \
    APP_ENV=test \
    DB_HOST=127.0.0.1 \
    DB_PORT="${LOCAL_DB_HOST_PORT}" \
    DB_NAME="${log_test_db}" \
    DB_USER="${LOCAL_DB_USER}" \
    DB_PASSWORD="${LOCAL_DB_PASSWORD}" \
    PGHOST=127.0.0.1 \
    PGPORT="${LOCAL_DB_HOST_PORT}" \
    PGDATABASE="${log_test_db}" \
    PGUSER="${LOCAL_DB_USER}" \
    PGPASSWORD="${LOCAL_DB_PASSWORD}" \
    "${log_db_python}" -m pytest tests/test_repository_postgres_integration.py \
      --junitxml=build/reports/tests/junit-postgres.xml >> "${log_db_test_log}" 2>&1; then
    popd >/dev/null
    echo "[FAIL] log DB integration test failed. See ${log_db_test_log}" >&2
    return 1
  fi
  popd >/dev/null
}

package_log_lambda() {
  local package_dir="${LOG_DIR}/log-lambda-package"
  local zip_path="${LOG_DIR}/log-lambda.zip"
  local pip_log="${LOG_DIR}/log-lambda-pip.log"
  local python_platform=""
  local lambda_python_version=""
  local lambda_python_abi=""

  rm -rf "${package_dir}" "${zip_path}"
  mkdir -p "${package_dir}"

  python_platform="$(${PYTHON_CMD} -c 'import sys; print(sys.platform)' 2>/dev/null || true)"
  lambda_python_version="${LOG_LAMBDA_RUNTIME#python}"
  if [[ ! "${lambda_python_version}" =~ ^[0-9]+\.[0-9]+$ ]]; then
    lambda_python_version="3.12"
  fi
  lambda_python_abi="cp${lambda_python_version//./}"

  if [[ "${python_platform}" == "win32" ]]; then
    # Build Linux-compatible deps when packaging from Windows host Python.
    ${PYTHON_CMD} -m pip install \
      -r "${ROOT_DIR}/services/backend/log/requirements.txt" \
      -t "${package_dir}" \
      --platform manylinux2014_x86_64 \
      --implementation cp \
      --python-version "${lambda_python_version}" \
      --abi "${lambda_python_abi}" \
      --only-binary=:all: \
      > "${pip_log}" 2>&1
  else
    ${PYTHON_CMD} -m pip install \
      -r "${ROOT_DIR}/services/backend/log/requirements.txt" \
      -t "${package_dir}" \
      > "${pip_log}" 2>&1
  fi

  cp "${ROOT_DIR}/services/backend/log/lambda_function.py" "${package_dir}/"
  cp -R "${ROOT_DIR}/services/backend/log/app" "${package_dir}/app"

  if command -v zip >/dev/null 2>&1; then
    (
      cd "${package_dir}"
      zip -rq "${zip_path}" .
    )
  else
    # Fallback for environments without `zip` (for example, bare Windows shells).
    ${PYTHON_CMD} - "${package_dir}" "${zip_path}" <<'PY'
import pathlib
import sys
import zipfile

src_dir = pathlib.Path(sys.argv[1])
zip_path = pathlib.Path(sys.argv[2])

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in src_dir.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(src_dir))
PY
  fi
}

package_single_file_lambda() {
  local source_file="$1"
  local package_dir="$2"
  local zip_path="$3"

  rm -rf "${package_dir}" "${zip_path}"
  mkdir -p "${package_dir}"
  cp "${source_file}" "${package_dir}/"

  if command -v zip >/dev/null 2>&1; then
    (
      cd "${package_dir}"
      zip -rq "${zip_path}" .
    )
  else
    ${PYTHON_CMD} - "${package_dir}" "${zip_path}" <<'PY'
import pathlib
import sys
import zipfile

src_dir = pathlib.Path(sys.argv[1])
zip_path = pathlib.Path(sys.argv[2])

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in src_dir.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(src_dir))
PY
  fi
}

package_verification_lambda() {
  local package_dir="${LOG_DIR}/verification-lambda-package"
  local zip_path="${LOG_DIR}/verification-lambda.zip"

  package_single_file_lambda \
    "${ROOT_DIR}/services/backend/verification/lambda_function.py" \
    "${package_dir}" \
    "${zip_path}"
}

package_sftp_transaction_collector() {
  local package_dir="${LOG_DIR}/sftp-transaction-collector-package"
  local zip_path="${LOG_DIR}/sftp-transaction-collector.zip"

  package_single_file_lambda \
    "${ROOT_DIR}/services/backend/sftp-transaction-collector/lambda_function.py" \
    "${package_dir}" \
    "${zip_path}"
}

package_aml_lambda() {
  local package_dir="${LOG_DIR}/aml-lambda-package"
  local zip_path="${LOG_DIR}/aml-lambda.zip"

  package_single_file_lambda \
    "${ROOT_DIR}/services/backend/aml/lambda_function.py" \
    "${package_dir}" \
    "${zip_path}"
}

package_audit_consumer_lambda() {
  local package_dir="${LOG_DIR}/audit-consumer-lambda-package"
  local zip_path="${LOG_DIR}/audit-consumer-lambda.zip"

  package_single_file_lambda \
    "${ROOT_DIR}/services/backend/audit-consumer/lambda_function.py" \
    "${package_dir}" \
    "${zip_path}"
}

package_aml_consumer_lambda() {
  local package_dir="${LOG_DIR}/aml-consumer-lambda-package"
  local zip_path="${LOG_DIR}/aml-consumer-lambda.zip"

  package_single_file_lambda \
    "${ROOT_DIR}/services/backend/aml-consumer/lambda_function.py" \
    "${package_dir}" \
    "${zip_path}"
}

deploy_log_lambda() {
  local zip_path="${LOG_DIR}/log-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi
  local env_vars="Variables={DB_HOST=${LOCAL_DB_HOST},DB_PORT=${LOCAL_DB_PORT},DB_NAME=${LOCAL_DB_NAME},DB_USER=${LOCAL_DB_USER},DB_PASSWORD=${LOCAL_DB_PASSWORD},JWT_HMAC_SECRET=dev-only-insecure-secret,AWS_DEFAULT_REGION=ap-southeast-1,AWS_ENDPOINT_URL=http://localstack:4566,CLIENT_SERVICE_URL=http://client-service:8080}"

  if aws_local lambda get-function --function-name "${LOG_LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null

    aws_local lambda update-function-configuration \
      --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${LOG_LAMBDA_RUNTIME}" \
      --timeout 30 \
      --memory-size 512 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
      --runtime "${LOG_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 512 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    if [[ "${state}" == "Failed" ]]; then
      local reason
      reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      reason="$(echo "${reason}" | tr -d '\r')"
      echo "[FAIL] Log Lambda entered Failed state: ${reason}" >&2
      exit 1
    fi
    [[ ${i} -eq 40 ]] && {
      local state_reason
      local update_reason
      state_reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      state_reason="$(echo "${state_reason}" | tr -d '\r')"
      update_reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
          --query "LastUpdateStatusReason" \
          --output text 2>/dev/null || true
      )"
      update_reason="$(echo "${update_reason}" | tr -d '\r')"
      echo "[FAIL] Log Lambda did not become Active in time (state=${state}, stateReason=${state_reason}, lastUpdateReason=${update_reason})" >&2
      exit 1
    }
    sleep 1
  done
}

deploy_verification_feedback_lambda() {
  local zip_path="${LOG_DIR}/verification-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  local topic_arn=""
  local lambda_arn=""
  local lambda_internal_log_url=""

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi

  topic_arn="$(
    aws_local sns list-topics \
      --query "Topics[?contains(TopicArn, '${VERIFICATION_SNS_TOPIC_NAME}')].TopicArn | [0]" \
      --output text
  )"
  topic_arn="$(normalize_text "${topic_arn}")"
  if [[ -z "${topic_arn}" || "${topic_arn}" == "None" ]]; then
    echo "[FAIL] Verification SNS topic was not found in LocalStack." >&2
    exit 1
  fi

  lambda_internal_log_url="$(echo "${LOG_SERVICE_URL}" | sed 's#localstack:4566#localhost:4566#g')"
  local env_vars="Variables={SES_SOURCE_EMAIL=${SES_SENDER_EMAIL},FRONTEND_BASE_URL=${PLAYWRIGHT_BASE_URL},LOG_API_BASE_URL=${lambda_internal_log_url},VERIFICATION_JWT_HMAC_SECRET=dev-only-insecure-secret,VERIFICATION_JWT_SUB=SYSTEM_VERIFICATION_FEEDBACK,VERIFICATION_JWT_ROLE=admin,VERIFICATION_JWT_TTL_SECONDS=300}"

  if aws_local lambda get-function --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${VERIFICATION_LAMBDA_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
      --runtime "${VERIFICATION_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    local state
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      break
    fi
    [[ ${i} -eq 40 ]] && {
      echo "[FAIL] Verification Lambda did not become Active in time (state=${state})." >&2
      exit 1
    }
    sleep 1
  done

  aws_local lambda add-permission \
    --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
    --statement-id "allow-sns-verification-feedback" \
    --action lambda:InvokeFunction \
    --principal sns.amazonaws.com \
    --source-arn "${topic_arn}" \
    >/dev/null 2>&1 || true

  lambda_arn="$(
    aws_local lambda get-function \
      --function-name "${VERIFICATION_LAMBDA_FUNCTION_NAME}" \
      --query "Configuration.FunctionArn" \
      --output text
  )"
  lambda_arn="$(normalize_text "${lambda_arn}")"

  aws_local sns subscribe \
    --topic-arn "${topic_arn}" \
    --protocol lambda \
    --notification-endpoint "${lambda_arn}" \
    >/dev/null 2>&1 || true
}

deploy_sftp_transaction_collector() {
  local zip_path="${LOG_DIR}/sftp-transaction-collector.zip"
  local zip_arg="fileb://${zip_path}"
  local env_vars="Variables={TRANSACTION_SFTP_BUCKET=scroogebank-crm-dev-transaction-sftp,TRANSACTION_SFTP_PREFIX=incoming/,TRANSACTION_IMPORT_URL=http://transaction-service:8080/api/transactions/import,TRANSACTION_IMPORT_JWT_HMAC_SECRET=dev-only-insecure-secret,TRANSACTION_IMPORT_JWT_SUB=SYSTEM_TRANSACTION_INGESTION,TRANSACTION_IMPORT_JWT_ROLE=admin,TRANSACTION_IMPORT_JWT_TTL_SECONDS=300}"

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi

  if aws_local lambda get-function --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${SFTP_TRANSACTION_COLLECTOR_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" \
      --runtime "${SFTP_TRANSACTION_COLLECTOR_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    local state
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    [[ ${i} -eq 40 ]] && {
      echo "[FAIL] Transaction ingestion Lambda did not become Active in time (state=${state})." >&2
      exit 1
    }
    sleep 1
  done
}

deploy_aml_lambda() {
  local zip_path="${LOG_DIR}/aml-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  local aml_bearer_token=""
  local aml_api_base_url="http://integration-gateway"
  local env_vars=""

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi

  aml_bearer_token="$(mint_jwt "system_aml_localstack" "admin")"
  env_vars="Variables={AML_SFTP_MODE=mock,CRM_API_BASE_URL=${aml_api_base_url},CRM_WRITE_API_BASE_URL=${aml_api_base_url},CRM_API_BEARER_TOKEN=${aml_bearer_token}}"

  if aws_local lambda get-function --function-name "${AML_LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${AML_LAMBDA_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${AML_LAMBDA_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${AML_LAMBDA_RUNTIME}" \
      --timeout 120 \
      --memory-size 1024 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${AML_LAMBDA_FUNCTION_NAME}" \
      --runtime "${AML_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 120 \
      --memory-size 1024 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    local state
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${AML_LAMBDA_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    [[ ${i} -eq 40 ]] && {
      echo "[FAIL] AML Lambda did not become Active in time (state=${state})." >&2
      exit 1
    }
    sleep 1
  done
}

deploy_audit_consumer_lambda() {
  local zip_path="${LOG_DIR}/audit-consumer-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  local env_vars="Variables={DYNAMODB_TABLE_NAME=${AUDIT_CONSUMER_TABLE_NAME},IDEMPOTENCY_TTL_DAYS=90,LOG_LEVEL=INFO}"

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi

  if aws_local lambda get-function --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${AUDIT_CONSUMER_LAMBDA_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --runtime "${AUDIT_CONSUMER_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    local state
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    if [[ "${state}" == "Failed" ]]; then
      local reason
      reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      reason="$(echo "${reason}" | tr -d '\r')"
      echo "[FAIL] audit-consumer Lambda entered Failed state: ${reason}" >&2
      exit 1
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] audit-consumer Lambda did not become Active in time (state=${state})." >&2
      exit 1
    fi
    sleep 1
  done
}

wire_audit_consumer_event_source_mapping() {
  local queue_url=""
  local queue_arn=""
  local mapping_uuid=""
  local mapping_state=""

  queue_url="$(
    aws_local sqs get-queue-url \
      --queue-name "${AUDIT_CONSUMER_QUEUE_NAME}" \
      --query "QueueUrl" \
      --output text
  )"
  queue_arn="$(
    aws_local sqs get-queue-attributes \
      --queue-url "${queue_url}" \
      --attribute-names QueueArn \
      --query "Attributes.QueueArn" \
      --output text
  )"
  queue_arn="$(normalize_text "${queue_arn}")"

  mapping_uuid="$(
    aws_local lambda list-event-source-mappings \
      --event-source-arn "${queue_arn}" \
      --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --query "EventSourceMappings[0].UUID" \
      --output text 2>/dev/null || true
  )"
  mapping_uuid="$(normalize_text "${mapping_uuid}")"

  if [[ -z "${mapping_uuid}" || "${mapping_uuid}" == "None" ]]; then
    mapping_uuid="$(
      aws_local lambda create-event-source-mapping \
        --function-name "${AUDIT_CONSUMER_LAMBDA_FUNCTION_NAME}" \
        --event-source-arn "${queue_arn}" \
        --enabled \
        --batch-size 10 \
        --function-response-types ReportBatchItemFailures \
        --query "UUID" \
        --output text
    )"
    mapping_uuid="$(normalize_text "${mapping_uuid}")"
  else
    aws_local lambda update-event-source-mapping \
      --uuid "${mapping_uuid}" \
      --enabled \
      --batch-size 10 \
      --function-response-types ReportBatchItemFailures \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    mapping_state="$(
      aws_local lambda get-event-source-mapping \
        --uuid "${mapping_uuid}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    mapping_state="$(normalize_text "${mapping_state}")"
    if [[ "${mapping_state}" == "Enabled" || "${mapping_state}" == "Enabling" ]]; then
      return 0
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] audit-consumer event source mapping was not enabled (state=${mapping_state})." >&2
      exit 1
    fi
    sleep 1
  done
}

deploy_aml_consumer_lambda() {
  local zip_path="${LOG_DIR}/aml-consumer-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  local env_vars="Variables={DYNAMODB_TABLE_NAME=${AML_CONSUMER_TABLE_NAME},IDEMPOTENCY_TTL_DAYS=90,LOG_LEVEL=INFO}"

  if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
    zip_arg="fileb://$(to_windows_path "${zip_path}")"
  fi

  if aws_local lambda get-function --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${AML_CONSUMER_LAMBDA_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --runtime "${AML_CONSUMER_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    local state
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    if [[ "${state}" == "Failed" ]]; then
      local reason
      reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      reason="$(echo "${reason}" | tr -d '\r')"
      echo "[FAIL] aml-consumer Lambda entered Failed state: ${reason}" >&2
      exit 1
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] aml-consumer Lambda did not become Active in time (state=${state})." >&2
      exit 1
    fi
    sleep 1
  done
}

wire_aml_consumer_event_source_mapping() {
  local queue_url=""
  local queue_arn=""
  local mapping_uuid=""
  local mapping_state=""

  queue_url="$(
    aws_local sqs get-queue-url \
      --queue-name "${AML_CONSUMER_QUEUE_NAME}" \
      --query "QueueUrl" \
      --output text
  )"
  queue_arn="$(
    aws_local sqs get-queue-attributes \
      --queue-url "${queue_url}" \
      --attribute-names QueueArn \
      --query "Attributes.QueueArn" \
      --output text
  )"
  queue_arn="$(normalize_text "${queue_arn}")"

  mapping_uuid="$(
    aws_local lambda list-event-source-mappings \
      --event-source-arn "${queue_arn}" \
      --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
      --query "EventSourceMappings[0].UUID" \
      --output text 2>/dev/null || true
  )"
  mapping_uuid="$(normalize_text "${mapping_uuid}")"

  if [[ -z "${mapping_uuid}" || "${mapping_uuid}" == "None" ]]; then
    mapping_uuid="$(
      aws_local lambda create-event-source-mapping \
        --function-name "${AML_CONSUMER_LAMBDA_FUNCTION_NAME}" \
        --event-source-arn "${queue_arn}" \
        --enabled \
        --batch-size 10 \
        --function-response-types ReportBatchItemFailures \
        --query "UUID" \
        --output text
    )"
    mapping_uuid="$(normalize_text "${mapping_uuid}")"
  else
    aws_local lambda update-event-source-mapping \
      --uuid "${mapping_uuid}" \
      --enabled \
      --batch-size 10 \
      --function-response-types ReportBatchItemFailures \
      >/dev/null
  fi

  for i in $(seq 1 40); do
    mapping_state="$(
      aws_local lambda get-event-source-mapping \
        --uuid "${mapping_uuid}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    mapping_state="$(normalize_text "${mapping_state}")"
    if [[ "${mapping_state}" == "Enabled" || "${mapping_state}" == "Enabling" ]]; then
      return 0
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] aml-consumer event source mapping was not enabled (state=${mapping_state})." >&2
      exit 1
    fi
    sleep 1
  done
}

provision_log_http_api() {
  local fallback_note_file="${LOG_DIR}/log-http-api-v2.err"
  local existing_ids
  existing_ids="$(
    aws_local apigatewayv2 get-apis \
      --query "Items[?Name=='${LOG_HTTP_API_NAME}'].ApiId" \
      --output text 2>/dev/null || true
  )"
  if [[ -n "${existing_ids}" && "${existing_ids}" != "None" ]]; then
    for api_id in ${existing_ids}; do
      aws_local apigatewayv2 delete-api --api-id "${api_id}" >/dev/null 2>&1 || true
    done
  fi

  local lambda_arn
  lambda_arn="$(
    aws_local lambda get-function \
      --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
      --query "Configuration.FunctionArn" \
      --output text
  )"
  lambda_arn="$(normalize_text "${lambda_arn}")"

  local api_id
  if api_id="$(
    aws_local apigatewayv2 create-api \
      --name "${LOG_HTTP_API_NAME}" \
      --protocol-type HTTP \
      --query "ApiId" \
      --output text 2>"${fallback_note_file}"
  )"; then
    api_id="$(normalize_text "${api_id}")"
    local integration_id
    integration_id="$(
      aws_local apigatewayv2 create-integration \
        --api-id "${api_id}" \
        --integration-type AWS_PROXY \
        --integration-uri "${lambda_arn}" \
        --payload-format-version 2.0 \
        --timeout-milliseconds 29000 \
        --query "IntegrationId" \
        --output text
    )"
    integration_id="$(normalize_text "${integration_id}")"

    aws_local apigatewayv2 create-route \
      --api-id "${api_id}" \
      --route-key '$default' \
      --target "integrations/${integration_id}" \
      >/dev/null

    aws_local apigatewayv2 create-stage \
      --api-id "${api_id}" \
      --stage-name "${LOG_HTTP_API_STAGE}" \
      --auto-deploy \
      >/dev/null
  else
    echo "[WARN] API Gateway v2 unavailable; falling back to API Gateway v1 (REST)." >&2

    local existing_rest_ids
    existing_rest_ids="$(
      aws_local apigateway get-rest-apis \
        --query "items[?name=='${LOG_HTTP_API_NAME}'].id" \
        --output text 2>/dev/null || true
    )"
    if [[ -n "${existing_rest_ids}" && "${existing_rest_ids}" != "None" ]]; then
      for rest_id in ${existing_rest_ids}; do
        aws_local apigateway delete-rest-api --rest-api-id "${rest_id}" >/dev/null 2>&1 || true
      done
    fi

    api_id="$(
      aws_local apigateway create-rest-api \
        --name "${LOG_HTTP_API_NAME}" \
        --query "id" \
        --output text
    )"
    api_id="$(normalize_text "${api_id}")"

    local root_id
    root_id="$(
      aws_local apigateway get-resources \
        --rest-api-id "${api_id}" \
        --query "items[?path=='/'].id | [0]" \
        --output text
    )"
    root_id="$(normalize_text "${root_id}")"

    local proxy_id
    proxy_id="$(
      aws_local apigateway create-resource \
        --rest-api-id "${api_id}" \
        --parent-id "${root_id}" \
        --path-part "{proxy+}" \
        --query "id" \
        --output text
    )"
    proxy_id="$(normalize_text "${proxy_id}")"

    local lambda_integration_uri
    lambda_integration_uri="arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/${lambda_arn}/invocations"

    aws_local apigateway put-method \
      --rest-api-id "${api_id}" \
      --resource-id "${root_id}" \
      --http-method ANY \
      --authorization-type NONE \
      >/dev/null

    aws_local apigateway put-integration \
      --rest-api-id "${api_id}" \
      --resource-id "${root_id}" \
      --http-method ANY \
      --type AWS_PROXY \
      --integration-http-method POST \
      --uri "${lambda_integration_uri}" \
      >/dev/null

    aws_local apigateway put-method \
      --rest-api-id "${api_id}" \
      --resource-id "${proxy_id}" \
      --http-method ANY \
      --authorization-type NONE \
      >/dev/null

    aws_local apigateway put-integration \
      --rest-api-id "${api_id}" \
      --resource-id "${proxy_id}" \
      --http-method ANY \
      --type AWS_PROXY \
      --integration-http-method POST \
      --uri "${lambda_integration_uri}" \
      >/dev/null

    aws_local apigateway create-deployment \
      --rest-api-id "${api_id}" \
      --stage-name "${LOG_HTTP_API_STAGE}" \
      >/dev/null
  fi

  aws_local lambda add-permission \
    --function-name "${LOG_LAMBDA_FUNCTION_NAME}" \
    --statement-id "allow-apigw-${api_id}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:ap-southeast-1:000000000000:${api_id}/*/*/*" \
    >/dev/null 2>&1 || true

  export LOG_SERVICE_URL="http://localstack:4566/_aws/execute-api/${api_id}/${LOG_HTTP_API_STAGE}"
  export CLIENT_LOG_SERVICE_URL="${LOG_SERVICE_URL}"
  export LOG_API_UPSTREAM="${LOG_SERVICE_URL}"
  export LOG_SERVICE_PUBLIC_URL="${LOCALSTACK_ENDPOINT}/_aws/execute-api/${api_id}/${LOG_HTTP_API_STAGE}"
}

mint_jwt() {
  local subject="$1"
  local role="$2"

  ${PYTHON_CMD} - "${subject}" "${role}" <<'PY'
import base64, hashlib, hmac, json, sys, time

subject, role = sys.argv[1], sys.argv[2]
secret = "dev-only-insecure-secret"
header  = {"alg": "HS256", "typ": "JWT"}
payload = {"sub": subject, "role": role,
           "iat": int(time.time()), "exp": int(time.time()) + 3600}

def b64url(d):
    return base64.urlsafe_b64encode(
        json.dumps(d, separators=(",", ":")).encode()
    ).rstrip(b"=").decode()

signing = f"{b64url(header)}.{b64url(payload)}"
sig = base64.urlsafe_b64encode(
    hmac.new(secret.encode(), signing.encode(), hashlib.sha256).digest()
).rstrip(b"=").decode()
print(f"{signing}.{sig}")
PY
}

mint_verification_token() {
  local client_id="$1"

  ${PYTHON_CMD} - "${client_id}" <<'PY'
import base64, hashlib, hmac, json, sys, time

client_id = sys.argv[1]
secret = "dev-only-insecure-secret"
header = {"alg": "HS256", "typ": "JWT"}
payload = {"clientId": client_id, "exp": int(time.time()) + 7200}

def b64url(d):
    return base64.urlsafe_b64encode(
        json.dumps(d, separators=(",", ":")).encode()
    ).rstrip(b"=").decode()

signing = f"{b64url(header)}.{b64url(payload)}"
sig = base64.urlsafe_b64encode(
    hmac.new(secret.encode(), signing.encode("ascii"), hashlib.sha256).digest()
).rstrip(b"=").decode()
print(f"{signing}.{sig}")
PY
}

# --------------------------------------------------------------------------
# Phase 1: Build artifacts and start base infra in parallel
# --------------------------------------------------------------------------

start_phase "Phase 1: Build artifacts + start base infra (parallel)"
start_base_infra &
infra_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/user" "user" &
user_build_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/client" "client" &
client_build_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/transaction" "transaction" &
transaction_build_pid=$!

package_log_lambda &
lambda_package_pid=$!
package_verification_lambda &
verification_lambda_package_pid=$!
package_sftp_transaction_collector &
sftp_transaction_collector_package_pid=$!
package_aml_lambda &
aml_lambda_package_pid=$!
package_audit_consumer_lambda &
audit_consumer_lambda_package_pid=$!
package_aml_consumer_lambda &
aml_consumer_lambda_package_pid=$!

wait_for_jobs \
  "${infra_pid}" "base-infra-up (postgres + localstack)" \
  "${user_build_pid}" "bootJar-user" \
  "${client_build_pid}" "bootJar-client" \
  "${transaction_build_pid}" "bootJar-transaction" \
  "${lambda_package_pid}" "package-log-lambda" \
  "${verification_lambda_package_pid}" "package-verification-lambda" \
  "${sftp_transaction_collector_package_pid}" "package-sftp-transaction-collector" \
  "${aml_lambda_package_pid}" "package-aml-lambda" \
  "${audit_consumer_lambda_package_pid}" "package-audit-consumer-lambda" \
  "${aml_consumer_lambda_package_pid}" "package-aml-consumer-lambda"
end_phase

# --------------------------------------------------------------------------
# Phase 2: Wait for LocalStack + init provisioning
# --------------------------------------------------------------------------

start_phase "Phase 2: LocalStack provisioning"
wait_for_http "${LOCALSTACK_ENDPOINT}/_localstack/health" "localstack"

echo "Waiting for LocalStack init provisioning (SQS sentinel)..."
INIT_ATTEMPTS=80
for i in $(seq 1 ${INIT_ATTEMPTS}); do
  localstack_queue_exists scroogebank-crm-dev-audit && {
    echo "[OK] LocalStack provisioning complete (attempt ${i}/${INIT_ATTEMPTS})"
    break
  }
  [[ ${i} -eq ${INIT_ATTEMPTS} ]] && {
    echo "[FAIL] LocalStack init did not complete after ${INIT_ATTEMPTS} attempts" >&2
    exit 1
  }
  sleep 3
done

end_phase

start_phase "Phase 2a: Shared Postgres migrations"
if [[ ! -f "${DB_ORCHESTRATOR_SCRIPT}" ]]; then
  echo "[FAIL] Missing DB orchestration script: ${DB_ORCHESTRATOR_SCRIPT}" >&2
  exit 1
fi
LOCAL_DB_HOST=postgres \
LOCAL_DB_PORT="${LOCAL_DB_PORT}" \
LOCAL_DB_NAME="${LOCAL_DB_NAME}" \
LOCAL_DB_USER="${LOCAL_DB_USER}" \
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD}" \
DB_DOCKER_NETWORK="${COMPOSE_PROJECT_NAME}_default" \
bash "${DB_ORCHESTRATOR_SCRIPT}" migrate \
  >> "${LOG_DIR}/docker-compose.log" 2>&1
end_phase

start_phase "Phase 2b: Deploy log + verification + ingestion + AML + audit/aml-consumer Lambdas"
echo "Packaging + deploying log-service Lambda to LocalStack..."
deploy_log_lambda
provision_log_http_api
echo "Deploying verification feedback Lambda + SNS subscription..."
deploy_verification_feedback_lambda
echo "Deploying transaction ingestion Lambda..."
deploy_sftp_transaction_collector
echo "Deploying AML batch Lambda..."
deploy_aml_lambda
echo "Deploying audit-consumer Lambda + SQS mapping..."
deploy_audit_consumer_lambda
wire_audit_consumer_event_source_mapping
echo "Deploying aml-consumer Lambda + SQS mapping..."
deploy_aml_consumer_lambda
wire_aml_consumer_event_source_mapping
wait_for_http "${LOG_SERVICE_PUBLIC_URL}/health" "log-service-lambda"
end_phase

start_phase "Phase 2c: Start application services + integration gateway"
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" up -d --build \
  user-service client-service transaction-service frontend integration-gateway \
  >> "${LOG_DIR}/docker-compose.log" 2>&1
end_phase

# --------------------------------------------------------------------------
# Phase 3: Wait for all application services to be healthy
# --------------------------------------------------------------------------

start_phase "Phase 3: Service health"
wait_for_http "http://127.0.0.1:18081/health" "user-service" &
user_health_pid=$!
wait_for_http "http://127.0.0.1:18082/health" "client-service" &
client_health_pid=$!
wait_for_http "http://127.0.0.1:18083/health" "transaction-service" &
transaction_health_pid=$!
wait_for_http "http://127.0.0.1:18085/health" "frontend" &
frontend_health_pid=$!
wait_for_http "${PLAYWRIGHT_BASE_URL}/health" "integration-gateway" &
gateway_health_pid=$!
wait_for_http "${PLAYWRIGHT_BASE_URL}/api/v1/logs/health" "log-service (lambda via gateway)" &
log_health_pid=$!

wait_for_jobs \
  "${user_health_pid}" "health-user-service" \
  "${client_health_pid}" "health-client-service" \
  "${transaction_health_pid}" "health-transaction-service" \
  "${frontend_health_pid}" "health-frontend" \
  "${gateway_health_pid}" "health-integration-gateway" \
  "${log_health_pid}" "health-log-service-via-gateway"
end_phase

# --------------------------------------------------------------------------
# Phase 3b: Seed baseline user principals for local/test
# --------------------------------------------------------------------------

start_phase "Phase 3b: Seed baseline principals"
USER_BASE_URL="http://127.0.0.1:18081" \
ROOT_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
ROOT_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}" \
SEED_USER_EMAIL="user@crm.local" \
SEED_AGENT_PASSWORD="${E2E_USER_PASSWORD:-UserPass123!}" \
bash "${DB_ORCHESTRATOR_SCRIPT}" seed \
  >> "${LOG_DIR}/docker-compose.log" 2>&1
end_phase

# --------------------------------------------------------------------------
# Phase 3c: DB-backed component checks (CI parity gate before E2E smoke)
# --------------------------------------------------------------------------

start_phase "Phase 3c: DB-backed component checks"
run_db_backed_component_tests
end_phase

# --------------------------------------------------------------------------
# Phase 3d: Re-seed baseline principals after DB-backed checks
# --------------------------------------------------------------------------

start_phase "Phase 3d: Re-seed baseline principals"
USER_BASE_URL="http://127.0.0.1:18081" \
ROOT_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
ROOT_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}" \
SEED_USER_EMAIL="user@crm.local" \
SEED_AGENT_PASSWORD="${E2E_USER_PASSWORD:-UserPass123!}" \
bash "${DB_ORCHESTRATOR_SCRIPT}" seed \
  >> "${LOG_DIR}/docker-compose.log" 2>&1
end_phase

# --------------------------------------------------------------------------
# Phase 4: Cross-service HTTP smoke assertions
# Validates critical service-to-service paths against real containers +
# real LocalStack before Playwright tests run.
# --------------------------------------------------------------------------

SKIP_PHASE4_SMOKE_NORMALIZED="$(printf '%s' "${SKIP_PHASE4_SMOKE:-false}" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n[:space:]')"
if [[ "${SKIP_PHASE4_SMOKE_NORMALIZED}" == "true" ]]; then
  echo ""
  echo "=== Phase 4: Skipped cross-service HTTP smoke (SKIP_PHASE4_SMOKE=true) ==="
else
start_phase "Phase 4: Cross-service HTTP smoke"

USER_TOKEN="$(mint_jwt "ci_user" "user")"
ADMIN_TOKEN="$(mint_jwt "ci_admin" "admin")"

SMOKE_CLIENT_EMAIL="jordan.taylor+${RUN_ID}@example.com"
SMOKE_CLIENT_PHONE="+1$(printf '%s' "${RUN_ID}" | tr -cd '0-9' | tail -c 11)"

CREATE_BODY='{
  "firstName": "Jordan",
  "lastName": "Taylor",
  "dateOfBirth": "1990-01-15",
  "gender": "Male",
  "emailAddress": "'"${SMOKE_CLIENT_EMAIL}"'",
  "phoneNumber": "'"${SMOKE_CLIENT_PHONE}"'",
  "address": "123 Main Street",
  "city": "Springfield",
  "state": "Illinois",
  "country": "United States",
  "postalCode": "62704"
}'

echo "  Smoke: client-service -> log-service-lambda (CREATE client, assert audit log written)"
CREATE_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "http://127.0.0.1:18082/api/clients" \
    --header "Authorization: Bearer ${USER_TOKEN}" \
    --header "Content-Type: application/json" \
    --header "X-Request-Id: ci-fullstack-smoke-001" \
    --data "${CREATE_BODY}"
)"

CLIENT_ID="$(CREATE_RESPONSE_JSON="${CREATE_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
print(json.loads(os.environ["CREATE_RESPONSE_JSON"])["clientId"])
PY
)"

# Poll log API for the CREATE audit entry (served by LocalStack-backed Lambda)
LOG_FOUND=false
for _ in {1..20}; do
  LOGS_JSON="$(
    curl --silent --show-error --fail \
      "${PLAYWRIGHT_BASE_URL}/api/logs?clientId=${CLIENT_ID}" \
      --header "Authorization: Bearer ${USER_TOKEN}" \
    || true
  )"
  if LOGS_JSON="${LOGS_JSON}" ${PYTHON_CMD} - "${CLIENT_ID}" <<'PY' 2>/dev/null; then
import json, os, sys
rows = json.loads(os.environ["LOGS_JSON"]).get("data", [])
if any(r.get("clientId") == sys.argv[1] and r.get("action") == "CREATE" for r in rows):
    raise SystemExit(0)
raise SystemExit(1)
PY
    LOG_FOUND=true
    echo "  [OK] audit log written for clientId=${CLIENT_ID}"
    break
  fi
  sleep 1
done
[[ "${LOG_FOUND}" == "true" ]] || {
  echo "  [FAIL] Expected CREATE audit log entry not found for clientId=${CLIENT_ID}" >&2
  exit 1
}

echo "  Smoke: tokenized verification upload -> pending -> admin review"
echo "  [INFO] using CI-minted verification token (local HMAC secret) to simulate email-link upload path"
VERIFICATION_TOKEN="$(mint_verification_token "${CLIENT_ID}")"
UPLOAD_VERIFY_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "http://127.0.0.1:18082/api/clients/${CLIENT_ID}/upload-verify" \
    --header "Content-Type: application/json" \
    --header "X-Request-Id: ci-fullstack-smoke-upload-verify-001" \
    --data "{
      \"verificationToken\": \"${VERIFICATION_TOKEN}\",
      \"primaryDocumentType\": \"NRIC\",
      \"primaryDocumentRef\": \"ci-primary-id.jpg\",
      \"primaryDocumentBase64\": \"cHJpbWFyeS1kb2M=\",
      \"primaryDocumentMimeType\": \"image/jpeg\",
      \"addressDocumentType\": \"UTILITY_BILL\",
      \"addressDocumentRef\": \"ci-proof-of-address.pdf\",
      \"addressDocumentBase64\": \"cHJvb2Ytb2YtYWRkcmVzcw==\",
      \"addressDocumentMimeType\": \"application/pdf\"
    }"
)"
UPLOAD_VERIFY_RESPONSE_JSON="${UPLOAD_VERIFY_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["UPLOAD_VERIFY_RESPONSE_JSON"])
status = payload.get("identityVerificationStatus")
if status != "pending":
  raise SystemExit("upload-verify endpoint did not return pending identityVerificationStatus")
print("  [OK] upload-verify endpoint returned pending status")
PY

CLIENT_AFTER_UPLOAD="$(
  curl --silent --show-error --fail \
    --request GET "http://127.0.0.1:18082/api/clients/${CLIENT_ID}" \
    --header "Authorization: Bearer ${USER_TOKEN}"
)"
CLIENT_AFTER_UPLOAD_JSON="${CLIENT_AFTER_UPLOAD}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["CLIENT_AFTER_UPLOAD_JSON"])
if payload.get("identityVerificationStatus") != "pending":
  raise SystemExit("client status did not persist as pending after upload-verify")
print("  [OK] client status is pending after upload-verify")
PY

REVIEW_RESPONSE="$(
  curl --silent --show-error --fail \
    --request PATCH "http://127.0.0.1:18082/api/clients/${CLIENT_ID}/verify/review" \
    --header "Authorization: Bearer ${ADMIN_TOKEN}" \
    --header "Content-Type: application/json" \
    --header "X-Request-Id: ci-fullstack-smoke-verify-review-001" \
    --data '{"action":"approve"}'
)"
REVIEW_RESPONSE_JSON="${REVIEW_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["REVIEW_RESPONSE_JSON"])
status = payload.get("identityVerificationStatus")
if status != "verified":
  raise SystemExit("verify/review endpoint did not return verified identityVerificationStatus after approve")
print("  [OK] verify/review endpoint returned verified status")
PY

COMMUNICATION_ID=""
PROVIDER_MESSAGE_ID=""
for _ in {1..20}; do
  COMMS_JSON="$(
    curl --silent --show-error --fail \
      "${LOG_SERVICE_PUBLIC_URL}/api/clients/${CLIENT_ID}/communications?limit=10&offset=0" \
      --header "Authorization: Bearer ${USER_TOKEN}" \
      || true
  )"
  COMM_EXTRACT="$(
    COMMS_JSON="${COMMS_JSON}" ${PYTHON_CMD} - <<'PY'
import json, os
try:
    payload = json.loads(os.environ["COMMS_JSON"])
except Exception:
    print("|")
    raise SystemExit(0)
rows = payload.get("data", [])
if not rows:
    print("|")
    raise SystemExit(0)
row = rows[0]
communication_id = row.get("communicationId", "")
provider_message_id = row.get("providerMessageId", "") or ""
status = row.get("status", "")
if communication_id and provider_message_id and status == "sent":
    print(f"{communication_id}|{provider_message_id}")
else:
    print("|")
PY
  )"
  COMMUNICATION_ID="${COMM_EXTRACT%%|*}"
  PROVIDER_MESSAGE_ID="${COMM_EXTRACT#*|}"
  if [[ -n "${COMMUNICATION_ID}" && -n "${PROVIDER_MESSAGE_ID}" ]]; then
    echo "  [OK] verification communication sent (id=${COMMUNICATION_ID}, providerMessageId=${PROVIDER_MESSAGE_ID})"
    break
  fi
  sleep 1
done
if [[ -z "${COMMUNICATION_ID}" || -z "${PROVIDER_MESSAGE_ID}" ]]; then
  echo "  [WARN] no sent communication with providerMessageId observed after verification lifecycle smoke; continuing." >&2
fi

if [[ "${VERIFICATION_EMAIL_PROVIDER}" == "ses" && -n "${COMMUNICATION_ID}" && -n "${PROVIDER_MESSAGE_ID}" ]]; then
  echo "  Smoke: SES feedback lambda update"
  VERIFICATION_TOPIC_ARN="$(
    aws_local sns list-topics \
      --query "Topics[?contains(TopicArn, '${VERIFICATION_SNS_TOPIC_NAME}')].TopicArn | [0]" \
      --output text
  )"
  VERIFICATION_TOPIC_ARN="$(normalize_text "${VERIFICATION_TOPIC_ARN}")"
  [[ -n "${VERIFICATION_TOPIC_ARN}" && "${VERIFICATION_TOPIC_ARN}" != "None" ]] || {
    echo "  [FAIL] verification SNS topic was not found for feedback publish" >&2
    exit 1
  }

  SES_FEEDBACK_MESSAGE="$(${PYTHON_CMD} - "${PROVIDER_MESSAGE_ID}" <<'PY'
import json
import sys
print(json.dumps({
    "eventType": "Bounce",
    "mail": {"messageId": sys.argv[1]},
    "bounce": {"bounceType": "Permanent", "bounceSubType": "General"}
}, separators=(",", ":")))
PY
  )"
  aws_local sns publish \
    --topic-arn "${VERIFICATION_TOPIC_ARN}" \
    --message "${SES_FEEDBACK_MESSAGE}" \
    >/dev/null

  FEEDBACK_APPLIED=false
  for _ in {1..20}; do
    COMM_STATUS_JSON="$(
      curl --silent --show-error --fail \
        "${LOG_SERVICE_PUBLIC_URL}/api/communications/${COMMUNICATION_ID}" \
        --header "Authorization: Bearer ${USER_TOKEN}" \
        || true
    )"
    if COMM_STATUS_JSON="${COMM_STATUS_JSON}" ${PYTHON_CMD} - <<'PY' 2>/dev/null; then
import json, os
payload = json.loads(os.environ["COMM_STATUS_JSON"])
if payload.get("status") == "failed" and payload.get("deliveryEvent") == "BOUNCE":
    raise SystemExit(0)
raise SystemExit(1)
PY
      FEEDBACK_APPLIED=true
      echo "  [OK] verification feedback lambda updated communication status to failed/BOUNCE"
      break
    fi
    sleep 1
  done
  [[ "${FEEDBACK_APPLIED}" == "true" ]] || {
    echo "  [FAIL] verification feedback lambda did not update communication status" >&2
    exit 1
  }
elif [[ "${VERIFICATION_EMAIL_PROVIDER}" == "ses" ]]; then
  echo "  [WARN] skipping SES feedback assertion because no communication providerMessageId was observed." >&2
else
  echo "  [SKIP] verification SNS feedback assertion (VERIFICATION_EMAIL_PROVIDER=${VERIFICATION_EMAIL_PROVIDER})"
fi

echo "  Smoke: transaction-service -> client-service (GET transactions)"
TX_RESPONSE="$(
  curl --silent --show-error --fail \
    "http://127.0.0.1:18083/api/clients/${CLIENT_ID}/transactions" \
    --header "Authorization: Bearer ${USER_TOKEN}"
)"
TX_RESPONSE_JSON="${TX_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os, sys
p = json.loads(os.environ["TX_RESPONSE_JSON"])
if "data" not in p or "pagination" not in p:
    raise SystemExit("transaction response missing expected keys")
print("  [OK] transaction-service -> client-service")
PY

echo "  Smoke: transaction-service imports from LocalStack S3 source"
TX_IMPORT_CLIENT_ID="clt_s3_ci_import"
# Keep direct-import smoke file outside scheduler prefix to avoid race collisions.
TX_IMPORT_KEY="manual/ci-s3-import.csv"
TX_IMPORT_FILE="${LOG_DIR}/ci-s3-import.csv"
generate_contract_transaction_csv "${TX_IMPORT_FILE}" 2 12001 91001 2026-01-01 2026-01-31 "${TX_IMPORT_CLIENT_ID}"

aws_local_s3_put_object "scroogebank-crm-dev-transaction-sftp" "${TX_IMPORT_KEY}" "${TX_IMPORT_FILE}"

IMPORT_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "http://127.0.0.1:18083/api/transactions/import" \
    --header "Authorization: Bearer ${ADMIN_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{\"sourcePath\":\"s3://scroogebank-crm-dev-transaction-sftp/${TX_IMPORT_KEY}\"}"
)"
IMPORT_RESPONSE_JSON="${IMPORT_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["IMPORT_RESPONSE_JSON"])
if payload.get("status") not in ("completed", "running"):
    raise SystemExit("transaction import status was not completed/running")
if int(payload.get("importedRecords", 0)) < 1:
    raise SystemExit("transaction import did not ingest any rows")
print("  [OK] transaction-service imported rows from S3 source")
PY

TX_S3_LIST_RESPONSE="$(
  curl --silent --show-error --fail \
    "http://127.0.0.1:18083/api/transactions?clientId=${TX_IMPORT_CLIENT_ID}" \
    --header "Authorization: Bearer ${ADMIN_TOKEN}"
)"
TX_S3_LIST_RESPONSE_JSON="${TX_S3_LIST_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["TX_S3_LIST_RESPONSE_JSON"])
rows = payload.get("data", [])
if len(rows) < 2:
    raise SystemExit("expected at least 2 imported S3 transactions")
print("  [OK] imported S3 transactions are queryable")
PY

echo "  Smoke: transaction-service scheduled poll path (time-triggered)"
TX_SCHEDULED_CLIENT_ID="clt_s3_ci_scheduler"
# Scheduler polls the configured `scheduled/` prefix in fullstack compose.
TX_SCHEDULED_KEY="scheduled/ci-scheduled-${RUN_ID}.csv"
TX_SCHEDULED_FILE="${LOG_DIR}/ci-scheduled-import.csv"
generate_contract_transaction_csv "${TX_SCHEDULED_FILE}" 1 12002 92001 2026-02-01 2026-02-28 "${TX_SCHEDULED_CLIENT_ID}"

aws_local_s3_put_object "scroogebank-crm-dev-transaction-sftp" "${TX_SCHEDULED_KEY}" "${TX_SCHEDULED_FILE}"

SCHEDULED_IMPORT_APPLIED=false
for _ in {1..30}; do
  TX_SCHEDULED_LIST_RESPONSE="$(
    curl --silent --show-error --fail \
      "http://127.0.0.1:18083/api/transactions?clientId=${TX_SCHEDULED_CLIENT_ID}" \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      || true
  )"
  if TX_SCHEDULED_LIST_RESPONSE_JSON="${TX_SCHEDULED_LIST_RESPONSE}" ${PYTHON_CMD} - <<'PY' 2>/dev/null; then
import json, os
payload = json.loads(os.environ["TX_SCHEDULED_LIST_RESPONSE_JSON"])
rows = payload.get("data", [])
if len(rows) >= 1:
    raise SystemExit(0)
raise SystemExit(1)
PY
    SCHEDULED_IMPORT_APPLIED=true
    echo "  [OK] transaction scheduled poll imported S3 object"
    break
  fi
  sleep 2
done
[[ "${SCHEDULED_IMPORT_APPLIED}" == "true" ]] || {
  echo "  [FAIL] transaction scheduled poll did not import queued S3 object" >&2
  exit 1
}

echo "  Smoke: sftp-transaction-collector Lambda -> transaction-service import API"
TX_INGESTION_LAMBDA_CLIENT_ID="clt_s3_ci_ingestion_lambda"
TX_INGESTION_LAMBDA_KEY="incoming/ci-ingestion-lambda-${RUN_ID}.csv"
TX_INGESTION_LAMBDA_FILE="${LOG_DIR}/ci-ingestion-lambda.csv"
generate_contract_transaction_csv "${TX_INGESTION_LAMBDA_FILE}" 1 12003 93001 2026-02-01 2026-02-28 "${TX_INGESTION_LAMBDA_CLIENT_ID}"

aws_local_s3_put_object "scroogebank-crm-dev-transaction-sftp" "${TX_INGESTION_LAMBDA_KEY}" "${TX_INGESTION_LAMBDA_FILE}"

TX_INGESTION_LAMBDA_INVOKE_OUTPUT="${LOG_DIR}/sftp-transaction-collector-invoke.json"
TX_INGESTION_LAMBDA_INVOKE_OUTPUT_ARG="${TX_INGESTION_LAMBDA_INVOKE_OUTPUT}"
if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
  TX_INGESTION_LAMBDA_INVOKE_OUTPUT_ARG="$(to_windows_path "${TX_INGESTION_LAMBDA_INVOKE_OUTPUT}")"
fi

aws_local lambda invoke \
  --function-name "${SFTP_TRANSACTION_COLLECTOR_FUNCTION_NAME}" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "${TX_INGESTION_LAMBDA_INVOKE_OUTPUT_ARG}" \
  >/dev/null

TX_INGESTION_LAMBDA_INVOKE_JSON="$(cat "${TX_INGESTION_LAMBDA_INVOKE_OUTPUT}")"
TX_INGESTION_LAMBDA_INVOKE_JSON="${TX_INGESTION_LAMBDA_INVOKE_JSON}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["TX_INGESTION_LAMBDA_INVOKE_JSON"])
status_code = int(payload.get("statusCode", 0))
if status_code not in (200, 202):
    raise SystemExit(f"sftp-transaction-collector lambda returned unexpected statusCode={status_code}")
print("  [OK] sftp-transaction-collector lambda invoked transaction import API")
PY

LAMBDA_IMPORT_APPLIED=false
for _ in {1..20}; do
  TX_INGESTION_LIST_RESPONSE="$(
    curl --silent --show-error --fail \
      "http://127.0.0.1:18083/api/transactions?clientId=${TX_INGESTION_LAMBDA_CLIENT_ID}" \
      --header "Authorization: Bearer ${ADMIN_TOKEN}" \
      || true
  )"
  if TX_INGESTION_LIST_RESPONSE_JSON="${TX_INGESTION_LIST_RESPONSE}" ${PYTHON_CMD} - <<'PY' 2>/dev/null; then
import json, os
payload = json.loads(os.environ["TX_INGESTION_LIST_RESPONSE_JSON"])
rows = payload.get("data", [])
if len(rows) >= 1:
    raise SystemExit(0)
raise SystemExit(1)
PY
    LAMBDA_IMPORT_APPLIED=true
    echo "  [OK] sftp-transaction-collector lambda path imported transaction rows"
    break
  fi
  sleep 2
done
[[ "${LAMBDA_IMPORT_APPLIED}" == "true" ]] || {
  echo "  [FAIL] sftp-transaction-collector lambda did not import transaction rows" >&2
  exit 1
}

echo "  Smoke: AML Lambda (LocalStack) -> alert persistence path"
AML_LAMBDA_INVOKE_OUTPUT="${LOG_DIR}/aml-lambda-invoke.json"
AML_LAMBDA_INVOKE_OUTPUT_ARG="${AML_LAMBDA_INVOKE_OUTPUT}"
if [[ "${AWS_IS_WINDOWS}" == "true" ]]; then
  AML_LAMBDA_INVOKE_OUTPUT_ARG="$(to_windows_path "${AML_LAMBDA_INVOKE_OUTPUT}")"
fi

aws_local lambda invoke \
  --function-name "${AML_LAMBDA_FUNCTION_NAME}" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "${AML_LAMBDA_INVOKE_OUTPUT_ARG}" \
  >/dev/null

AML_LAMBDA_INVOKE_JSON="$(cat "${AML_LAMBDA_INVOKE_OUTPUT}")"
AML_LAMBDA_ALERT_ID="$(
  AML_LAMBDA_INVOKE_JSON="${AML_LAMBDA_INVOKE_JSON}" ${PYTHON_CMD} - <<'PY'
import json
import os

payload = json.loads(os.environ["AML_LAMBDA_INVOKE_JSON"])
status_code = int(payload.get("statusCode", 0))
if status_code != 200:
    raise SystemExit(f"AML lambda returned unexpected statusCode={status_code}")

body = payload.get("body", {})
if isinstance(body, str):
    body = json.loads(body)
if not isinstance(body, dict):
    raise SystemExit("AML lambda response body is not a JSON object")

alerts = body.get("alerts", [])
if not isinstance(alerts, list) or not alerts:
    raise SystemExit("AML lambda did not produce any alerts")

first_alert_id = alerts[0].get("alertId", "")
if not first_alert_id:
    raise SystemExit("AML lambda alert payload missing alertId")

print(first_alert_id)
PY
)"
[[ -n "${AML_LAMBDA_ALERT_ID}" ]] || {
  echo "  [FAIL] AML lambda invocation did not return a valid alertId" >&2
  exit 1
}

AML_LAMBDA_ALERT_FETCH="$(
  curl --silent --show-error --fail \
    "${PLAYWRIGHT_BASE_URL}/api/aml/alerts/${AML_LAMBDA_ALERT_ID}" \
    --header "Authorization: Bearer ${ADMIN_TOKEN}"
)"
AML_LAMBDA_ALERT_FETCH_JSON="${AML_LAMBDA_ALERT_FETCH}" ${PYTHON_CMD} - "${AML_LAMBDA_ALERT_ID}" <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["AML_LAMBDA_ALERT_FETCH_JSON"])
if payload.get("alertId") != sys.argv[1]:
    raise SystemExit("Persisted AML alertId mismatch after lambda invocation")
print("  [OK] AML lambda persisted alert via LocalStack-backed path")
PY

echo "  Smoke: AML alerts -> log-service-lambda (CREATE + REVIEW)"
ALERT_ID="aml-smoke-$(date +%s)"
AML_CREATE_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "${PLAYWRIGHT_BASE_URL}/api/aml/alerts" \
    --header "Authorization: Bearer ${ADMIN_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{
      \"alertId\": \"${ALERT_ID}\",
      \"clientId\": \"${CLIENT_ID}\",
      \"transactionId\": null,
      \"alertType\": \"STRUCTURING\",
      \"description\": \"CI AML smoke alert\",
      \"detectedAt\": \"2026-01-01T00:00:00Z\",
      \"reviewStatus\": \"Pending\"
    }"
)"
AML_CREATE_RESPONSE_JSON="${AML_CREATE_RESPONSE}" ${PYTHON_CMD} - "${ALERT_ID}" <<'PY'
import json, os, sys
payload = json.loads(os.environ["AML_CREATE_RESPONSE_JSON"])
if payload.get("alertId") != sys.argv[1]:
    raise SystemExit("AML create response alertId mismatch")
if payload.get("reviewStatus") != "Pending":
    raise SystemExit("AML create response reviewStatus mismatch")
print("  [OK] AML alert created")
PY

AML_REVIEW_RESPONSE=""
AML_REVIEW_LAST_STATUS=""
AML_REVIEW_LAST_BODY=""
for attempt in $(seq 1 5); do
  review_response_file="$(mktemp)"
  AML_REVIEW_LAST_STATUS="$(
    curl --silent --show-error \
      --request PUT "${PLAYWRIGHT_BASE_URL}/api/aml/alerts/${ALERT_ID}/review" \
      --header "Authorization: Bearer ${USER_TOKEN}" \
      --header "Content-Type: application/json" \
      --data '{"reviewStatus":"Confirmed"}' \
      --output "${review_response_file}" \
      --write-out "%{http_code}" \
      || true
  )"
  AML_REVIEW_LAST_STATUS="$(normalize_text "${AML_REVIEW_LAST_STATUS}")"
  AML_REVIEW_LAST_BODY="$(cat "${review_response_file}" 2>/dev/null || true)"
  rm -f "${review_response_file}"

  if [[ "${AML_REVIEW_LAST_STATUS}" == "200" ]]; then
    AML_REVIEW_RESPONSE="${AML_REVIEW_LAST_BODY}"
    break
  fi

  if [[ "${AML_REVIEW_LAST_STATUS}" == "503" || "${AML_REVIEW_LAST_STATUS}" == "000" ]]; then
    if [[ ${attempt} -lt 5 ]]; then
      echo "  [WARN] AML review attempt ${attempt}/5 returned ${AML_REVIEW_LAST_STATUS}; retrying..."
      sleep 2
      continue
    fi
  fi

  echo "  [FAIL] AML review request failed (status=${AML_REVIEW_LAST_STATUS})." >&2
  [[ -n "${AML_REVIEW_LAST_BODY}" ]] && {
    echo "  [FAIL] AML review response body: ${AML_REVIEW_LAST_BODY}" >&2
  }
  exit 1
done
[[ -n "${AML_REVIEW_RESPONSE}" ]] || {
  echo "  [FAIL] AML review request failed after retries (last status=${AML_REVIEW_LAST_STATUS})." >&2
  [[ -n "${AML_REVIEW_LAST_BODY}" ]] && {
    echo "  [FAIL] AML review response body: ${AML_REVIEW_LAST_BODY}" >&2
  }
  exit 1
}
AML_REVIEW_RESPONSE_JSON="${AML_REVIEW_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["AML_REVIEW_RESPONSE_JSON"])
if payload.get("reviewStatus") != "Confirmed":
    raise SystemExit("AML review update failed")
print("  [OK] AML alert review updated")
PY

echo "  Smoke: audit-consumer LocalStack SQS -> Lambda -> DynamoDB"
AUDIT_QUEUE_URL="$(
  aws_local sqs get-queue-url \
    --queue-name "${AUDIT_CONSUMER_QUEUE_NAME}" \
    --query QueueUrl \
    --output text
)"
AUDIT_EVENT_ID="evt-fullstack-${RUN_ID}"
AUDIT_OCCURRED_AT="2026-03-01T10:30:00Z"
AUDIT_VALID_PAYLOAD="$(cat <<JSON
{"eventId":"${AUDIT_EVENT_ID}","occurredAt":"${AUDIT_OCCURRED_AT}","action":"CLIENT_UPDATED","attributeName":"risk_rating","userId":"fullstack-user","clientId":"${CLIENT_ID}","sourceService":"fullstack-smoke","beforeValue":"low","afterValue":"high","metadata":{"suite":"fullstack-smoke"}}
JSON
)"
AUDIT_PK="AUDIT#${AUDIT_EVENT_ID}"
AUDIT_SK="${AUDIT_OCCURRED_AT}"

aws_local sqs send-message \
  --queue-url "${AUDIT_QUEUE_URL}" \
  --message-body "${AUDIT_VALID_PAYLOAD}" \
  >/dev/null

wait_for_dynamodb_item_pk_sk "${AUDIT_CONSUMER_TABLE_NAME}" "${AUDIT_PK}" "${AUDIT_SK}" 40
AUDIT_VALID_COUNT="$(dynamodb_count_by_pk "${AUDIT_CONSUMER_TABLE_NAME}" "${AUDIT_PK}")"
if [[ "${AUDIT_VALID_COUNT}" != "1" ]]; then
  echo "  [FAIL] audit-consumer valid message expected 1 row, got ${AUDIT_VALID_COUNT}" >&2
  exit 1
fi
echo "  [OK] audit-consumer valid message wrote one row"

aws_local sqs send-message \
  --queue-url "${AUDIT_QUEUE_URL}" \
  --message-body "${AUDIT_VALID_PAYLOAD}" \
  >/dev/null
wait_for_queue_drained "${AUDIT_QUEUE_URL}" 30 2
AUDIT_DUPLICATE_COUNT="$(dynamodb_count_by_pk "${AUDIT_CONSUMER_TABLE_NAME}" "${AUDIT_PK}")"
if [[ "${AUDIT_DUPLICATE_COUNT}" != "1" ]]; then
  echo "  [FAIL] audit-consumer duplicate message created extra rows (count=${AUDIT_DUPLICATE_COUNT})" >&2
  exit 1
fi
echo "  [OK] audit-consumer duplicate message treated as success"

aws_local sqs send-message \
  --queue-url "${AUDIT_QUEUE_URL}" \
  --message-body '{bad-json' \
  >/dev/null
wait_for_queue_drained "${AUDIT_QUEUE_URL}" 30 3
AUDIT_POST_MALFORMED_COUNT="$(dynamodb_count_by_pk "${AUDIT_CONSUMER_TABLE_NAME}" "${AUDIT_PK}")"
if [[ "${AUDIT_POST_MALFORMED_COUNT}" != "1" ]]; then
  echo "  [FAIL] audit-consumer malformed message path changed persisted row count (count=${AUDIT_POST_MALFORMED_COUNT})" >&2
  exit 1
fi
echo "  [OK] audit-consumer malformed message exercised non-retryable path"

echo "  Smoke: aml-consumer LocalStack SQS -> Lambda -> DynamoDB"
AML_CONSUMER_QUEUE_URL="$(
  aws_local sqs get-queue-url \
    --queue-name "${AML_CONSUMER_QUEUE_NAME}" \
    --query QueueUrl \
    --output text
)"
AML_CONSUMER_ALERT_ID="aml-consumer-fullstack-${RUN_ID}"
AML_CONSUMER_DETECTED_AT="2026-03-01T10:30:00Z"
AML_CONSUMER_VALID_PAYLOAD="$(cat <<JSON
{"alertId":"${AML_CONSUMER_ALERT_ID}","detectedAt":"${AML_CONSUMER_DETECTED_AT}","clientId":"${CLIENT_ID}","alertType":"LargeCashDeposit","description":"fullstack aml-consumer smoke","reviewStatus":"Pending","entityId":"entity-fullstack","sourceService":"fullstack-smoke","metadata":{"suite":"fullstack-smoke"}}
JSON
)"
AML_CONSUMER_PK="AML#${AML_CONSUMER_ALERT_ID}"
AML_CONSUMER_SK="${AML_CONSUMER_DETECTED_AT}"

aws_local sqs send-message \
  --queue-url "${AML_CONSUMER_QUEUE_URL}" \
  --message-body "${AML_CONSUMER_VALID_PAYLOAD}" \
  >/dev/null

wait_for_dynamodb_item_pk_sk "${AML_CONSUMER_TABLE_NAME}" "${AML_CONSUMER_PK}" "${AML_CONSUMER_SK}" 40
AML_CONSUMER_VALID_COUNT="$(dynamodb_count_by_pk "${AML_CONSUMER_TABLE_NAME}" "${AML_CONSUMER_PK}")"
if [[ "${AML_CONSUMER_VALID_COUNT}" != "1" ]]; then
  echo "  [FAIL] aml-consumer valid message expected 1 row, got ${AML_CONSUMER_VALID_COUNT}" >&2
  exit 1
fi
echo "  [OK] aml-consumer valid message wrote one row"

aws_local sqs send-message \
  --queue-url "${AML_CONSUMER_QUEUE_URL}" \
  --message-body "${AML_CONSUMER_VALID_PAYLOAD}" \
  >/dev/null
wait_for_queue_drained "${AML_CONSUMER_QUEUE_URL}" 30 2
AML_CONSUMER_DUPLICATE_COUNT="$(dynamodb_count_by_pk "${AML_CONSUMER_TABLE_NAME}" "${AML_CONSUMER_PK}")"
if [[ "${AML_CONSUMER_DUPLICATE_COUNT}" != "1" ]]; then
  echo "  [FAIL] aml-consumer duplicate message created extra rows (count=${AML_CONSUMER_DUPLICATE_COUNT})" >&2
  exit 1
fi
echo "  [OK] aml-consumer duplicate message treated as success"

aws_local sqs send-message \
  --queue-url "${AML_CONSUMER_QUEUE_URL}" \
  --message-body '{bad-json' \
  >/dev/null
wait_for_queue_drained "${AML_CONSUMER_QUEUE_URL}" 30 3
AML_CONSUMER_POST_MALFORMED_COUNT="$(dynamodb_count_by_pk "${AML_CONSUMER_TABLE_NAME}" "${AML_CONSUMER_PK}")"
if [[ "${AML_CONSUMER_POST_MALFORMED_COUNT}" != "1" ]]; then
  echo "  [FAIL] aml-consumer malformed message path changed persisted row count (count=${AML_CONSUMER_POST_MALFORMED_COUNT})" >&2
  exit 1
fi
echo "  [OK] aml-consumer malformed message exercised non-retryable path"

echo "All cross-service smoke assertions passed."
end_phase
fi

# --------------------------------------------------------------------------
# Phase 5: Real Playwright E2E against the live stack
# --------------------------------------------------------------------------

if [[ "${FULLSTACK_MODE}" == "full" || "${FULLSTACK_MODE}" == "pr" ]]; then
  start_phase "Phase 5: Playwright integration E2E (${PLAYWRIGHT_SCOPE_LABEL})"

  E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE="${E2E_TRANSACTION_IMPORT_SOURCE_PATH:-}"
  if [[ -z "${E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE}" ]]; then
    TX_E2E_IMPORT_CLIENT_ID="clt_s3_e2e_${RUN_ID//[^0-9]/}"
    TX_E2E_IMPORT_KEY="manual/ci-playwright-import-${RUN_ID}.csv"
    TX_E2E_IMPORT_FILE="${LOG_DIR}/ci-playwright-import.csv"
    generate_contract_transaction_csv "${TX_E2E_IMPORT_FILE}" 2 12004 94001 2026-03-01 2026-03-15 "${TX_E2E_IMPORT_CLIENT_ID}"
    aws_local_s3_put_object "scroogebank-crm-dev-transaction-sftp" "${TX_E2E_IMPORT_KEY}" "${TX_E2E_IMPORT_FILE}"
    E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE="s3://scroogebank-crm-dev-transaction-sftp/${TX_E2E_IMPORT_KEY}"
  fi

  pushd "${INTEGRATION_TEST_DIR}" >/dev/null
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    npm ci
    npx playwright install --with-deps chromium
    playwright_cmd=(npx playwright test)
    if [[ ${#PLAYWRIGHT_SPEC_ARGS[@]} -gt 0 ]]; then
      playwright_cmd+=("${PLAYWRIGHT_SPEC_ARGS[@]}")
      echo "Running Playwright subset specs: ${PLAYWRIGHT_SPEC_ARGS[*]}"
    fi
    PLAYWRIGHT_EXTERNAL_BASE_URL=true \
    PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
    E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
    E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}" \
    E2E_USER_PASSWORD="${E2E_USER_PASSWORD:-UserPass123!}" \
    E2E_TRANSACTION_IMPORT_SOURCE_PATH="${E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE}" \
    "${playwright_cmd[@]}"
  elif command -v cmd.exe >/dev/null 2>&1; then
    win_integration_dir="$(to_windows_path "${INTEGRATION_TEST_DIR}")"
    cmd.exe /c "cd /d ${win_integration_dir} && npm.cmd ci"
    cmd.exe /c "cd /d ${win_integration_dir} && npx.cmd playwright install chromium"
    if [[ ${#PLAYWRIGHT_SPEC_ARGS[@]} -gt 0 ]]; then
      cmd.exe /c "cd /d ${win_integration_dir} && set PLAYWRIGHT_EXTERNAL_BASE_URL=true&& set PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL}&& set E2E_ADMIN_EMAIL=${E2E_ADMIN_EMAIL:-admin@crm.local}&& set E2E_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}&& set E2E_USER_PASSWORD=${E2E_USER_PASSWORD:-UserPass123!}&& set E2E_TRANSACTION_IMPORT_SOURCE_PATH=${E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE}&& npx.cmd playwright test ${PLAYWRIGHT_SPEC_ARGS[*]}"
    else
      cmd.exe /c "cd /d ${win_integration_dir} && set PLAYWRIGHT_EXTERNAL_BASE_URL=true&& set PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL}&& set E2E_ADMIN_EMAIL=${E2E_ADMIN_EMAIL:-admin@crm.local}&& set E2E_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}&& set E2E_USER_PASSWORD=${E2E_USER_PASSWORD:-UserPass123!}&& set E2E_TRANSACTION_IMPORT_SOURCE_PATH=${E2E_TRANSACTION_IMPORT_SOURCE_PATH_VALUE}&& npm.cmd test"
    fi
  else
    echo "[FAIL] Node.js toolchain unavailable (need node/npm/npx, or cmd.exe + npm.cmd in WSL)." >&2
    exit 1
  fi
  popd >/dev/null
  end_phase
else
  echo ""
  echo "=== Phase 5: Skipped Playwright integration E2E (FULLSTACK_MODE=${FULLSTACK_MODE}) ==="
fi

echo ""
if [[ "${FULLSTACK_MODE}" == "full" ]]; then
  echo "Fullstack integration tests passed (LocalStack + HTTP smoke + Playwright)."
elif [[ "${FULLSTACK_MODE}" == "pr" ]]; then
  echo "Fullstack integration PR tests passed (LocalStack + HTTP smoke + critical Playwright subset)."
else
  echo "Fullstack smoke tests passed (LocalStack + HTTP smoke; Playwright skipped)."
fi
