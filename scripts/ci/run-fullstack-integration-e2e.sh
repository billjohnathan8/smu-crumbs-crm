#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
LOG_DIR="${ROOT_DIR}/build-logs/fullstack-integration"
FRONTEND_DIR="${ROOT_DIR}/services/frontend/crm-ui"
INTEGRATION_TEST_DIR="${ROOT_DIR}/tests/integration"

PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:18088}"
COMPOSE_PROJECT_NAME="crm-fullstack-it-${GITHUB_RUN_ID:-local}"
FULLSTACK_MODE="${FULLSTACK_MODE:-full}" # full | smoke
case "${FULLSTACK_MODE}" in
  full|smoke) ;;
  *)
    echo "[FAIL] FULLSTACK_MODE must be 'full' or 'smoke' (got: ${FULLSTACK_MODE})" >&2
    exit 1
    ;;
esac

SCRIPT_START_TS="$(date +%s)"
CURRENT_PHASE_NAME=""
CURRENT_PHASE_START_TS=0

# Fake creds - LocalStack accepts any non-empty value
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_PAGER=""
LOCALSTACK_ENDPOINT="http://127.0.0.1:14566"
LOG_LAMBDA_FUNCTION_NAME="scroogebank-crm-dev-log-service"
LOG_HTTP_API_NAME="scroogebank-crm-dev-log-http-api-it"
LOG_HTTP_API_STAGE="local"
LOG_LAMBDA_RUNTIME="${LOG_LAMBDA_RUNTIME:-python3.12}"

# Set safe defaults so compose parsing works for `down` before dynamic provisioning.
export LOG_SERVICE_URL="${LOG_SERVICE_URL:-http://localstack:4566}"
export LOG_API_UPSTREAM="${LOG_API_UPSTREAM:-http://localstack:4566}"

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

dump_compose_logs() {
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" logs --no-color \
    > "${LOG_DIR}/docker-compose.log" 2>&1 || true
}

aws_local() {
  "${AWS_CMD}" --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 "$@"
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

cleanup() {
  local exit_code=$?
  end_phase
  dump_compose_logs
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
    >> "${LOG_DIR}/docker-compose.log" 2>&1 || true

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
          break 2
        fi
      done < <(compgen -G "${_pattern}")
    done
  fi

  pushd "${service_dir}" >/dev/null
  chmod +x gradlew
  local gradle_log="${LOG_DIR}/${service_name}-bootjar.log"
  if ! ./gradlew bootJar --no-daemon --console=plain > "${gradle_log}" 2>&1; then
    # WSL can fail to execute Windows-discovered JAVA_HOME (java.exe only).
    # Retry with Gradle Windows wrapper when available.
    if grep -q "JAVA_HOME" "${gradle_log}" \
      && command -v cmd.exe >/dev/null 2>&1 \
      && [ -f "./gradlew.bat" ] \
      && command -v wslpath >/dev/null 2>&1; then
      local win_gradlew
      win_gradlew="$(wslpath -w "${service_dir}/gradlew.bat")"
      cmd.exe /c "${win_gradlew} bootJar --no-daemon --console=plain" \
        > "${gradle_log}" 2>&1
    else
      popd >/dev/null
      return 1
    fi
  fi
  popd >/dev/null
}

package_log_lambda() {
  local package_dir="${LOG_DIR}/log-lambda-package"
  local zip_path="${LOG_DIR}/log-lambda.zip"

  rm -rf "${package_dir}" "${zip_path}"
  mkdir -p "${package_dir}"

  ${PYTHON_CMD} -m pip install \
    -r "${ROOT_DIR}/services/backend/log/requirements.txt" \
    -t "${package_dir}" \
    > "${LOG_DIR}/log-lambda-pip.log" 2>&1

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

deploy_log_lambda() {
  local zip_path="${LOG_DIR}/log-lambda.zip"
  local zip_arg="fileb://${zip_path}"
  if [[ "${AWS_CMD}" == *".exe" || "${AWS_CMD}" == *".exe\""* ]]; then
    if command -v wslpath >/dev/null 2>&1; then
      local zip_windows_path
      zip_windows_path="$(wslpath -w "${zip_path}")"
      zip_arg="fileb://${zip_windows_path}"
    fi
  fi
  local env_vars="Variables={DB_HOST=postgres,DB_PORT=5432,DB_NAME=crm_it,DB_USER=postgres,DB_PASSWORD=postgres,JWT_HMAC_SECRET=dev-only-insecure-secret,AWS_DEFAULT_REGION=ap-southeast-1,AWS_ENDPOINT_URL=http://localstack:4566}"

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

  export LOG_SERVICE_URL="http://localstack:4566/restapis/${api_id}/${LOG_HTTP_API_STAGE}/_user_request_"
  export LOG_API_UPSTREAM="${LOG_SERVICE_URL}"
  export LOG_SERVICE_PUBLIC_URL="${LOCALSTACK_ENDPOINT}/restapis/${api_id}/${LOG_HTTP_API_STAGE}/_user_request_"
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

# --------------------------------------------------------------------------
# Phase 1: Build artifacts and start base infra in parallel
# --------------------------------------------------------------------------

start_phase "Phase 1: Build artifacts + start base infra (parallel)"
start_base_infra &
infra_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/agent" "agent" &
agent_build_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/client" "client" &
client_build_pid=$!

build_java_jar "${ROOT_DIR}/services/backend/transaction" "transaction" &
transaction_build_pid=$!

package_log_lambda &
lambda_package_pid=$!

wait_for_jobs \
  "${infra_pid}" "base-infra-up (postgres + localstack)" \
  "${agent_build_pid}" "bootJar-agent" \
  "${client_build_pid}" "bootJar-client" \
  "${transaction_build_pid}" "bootJar-transaction" \
  "${lambda_package_pid}" "package-log-lambda"
end_phase

# --------------------------------------------------------------------------
# Phase 2: Wait for LocalStack + init provisioning + deploy log Lambda/API
# --------------------------------------------------------------------------

start_phase "Phase 2: LocalStack provisioning + log Lambda/API"
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

echo "Packaging + deploying log-service Lambda to LocalStack..."
deploy_log_lambda
provision_log_http_api
wait_for_http "${LOG_SERVICE_PUBLIC_URL}/health" "log-service-lambda"
end_phase

start_phase "Phase 2b: Start application services + integration gateway"
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" up -d --build \
  agent-service client-service transaction-service frontend integration-gateway \
  >> "${LOG_DIR}/docker-compose.log" 2>&1
end_phase

# --------------------------------------------------------------------------
# Phase 3: Wait for all application services to be healthy
# --------------------------------------------------------------------------

start_phase "Phase 3: Service health"
wait_for_http "http://127.0.0.1:18081/health" "agent-service" &
agent_health_pid=$!
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
  "${agent_health_pid}" "health-agent-service" \
  "${client_health_pid}" "health-client-service" \
  "${transaction_health_pid}" "health-transaction-service" \
  "${frontend_health_pid}" "health-frontend" \
  "${gateway_health_pid}" "health-integration-gateway" \
  "${log_health_pid}" "health-log-service-via-gateway"
end_phase

# --------------------------------------------------------------------------
# Phase 3b: Warm up JVM + seed CI agent user
# The agent-service JVM (port 18081) only receives health-check traffic in
# Phase 3; the first real API call from Playwright would be cold.  Logging in
# here warms the JVM and also creates the agent@crm.local account that the
# Playwright agent-flow tests expect.
# --------------------------------------------------------------------------

start_phase "Phase 3b: Warm up agent-service + seed CI agent user"

ADMIN_ACCESS_TOKEN="$(
  curl --silent --show-error --fail \
    --request POST "http://127.0.0.1:18081/api/auth/login" \
    --header "Content-Type: application/json" \
    --data "{\"email\":\"${E2E_ADMIN_EMAIL:-admin@crm.local}\",\"password\":\"${E2E_ADMIN_PASSWORD:-admin123}\"}" \
  | ${PYTHON_CMD} -c "import json,sys; print(json.load(sys.stdin)['accessToken'])"
)"

echo "  [OK] admin login (agent-service JVM warmed up)"

curl --silent --show-error \
  --request POST "http://127.0.0.1:18081/api/agents" \
  --header "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{
    \"firstName\": \"CI\",
    \"lastName\": \"Agent\",
    \"email\": \"agent@crm.local\",
    \"role\": \"agent\",
    \"sendInviteEmail\": false,
    \"temporaryPassword\": \"${E2E_AGENT_PASSWORD:-AgentPass123!}\"
  }" > /dev/null \
  && echo "  [OK] CI agent user created (agent@crm.local)" \
  || echo "  [WARN] CI agent user creation skipped (may already exist)"
end_phase

# --------------------------------------------------------------------------
# Phase 4: Cross-service HTTP smoke assertions
# Validates critical service-to-service paths against real containers +
# real LocalStack before Playwright tests run.
# --------------------------------------------------------------------------

start_phase "Phase 4: Cross-service HTTP smoke"

AGENT_TOKEN="$(mint_jwt "ci_agent" "agent")"

CREATE_BODY='{
  "firstName": "Jordan",
  "lastName": "Taylor",
  "dateOfBirth": "1990-01-15",
  "gender": "Male",
  "emailAddress": "jordan.taylor@example.com",
  "phoneNumber": "+15551234567",
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
    --header "Authorization: Bearer ${AGENT_TOKEN}" \
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
      --header "Authorization: Bearer ${AGENT_TOKEN}" \
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

echo "  Smoke: transaction-service -> client-service (GET transactions)"
TX_RESPONSE="$(
  curl --silent --show-error --fail \
    "http://127.0.0.1:18083/api/clients/${CLIENT_ID}/transactions" \
    --header "Authorization: Bearer ${AGENT_TOKEN}"
)"
TX_RESPONSE_JSON="${TX_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os, sys
p = json.loads(os.environ["TX_RESPONSE_JSON"])
if "data" not in p or "pagination" not in p:
    raise SystemExit("transaction response missing expected keys")
print("  [OK] transaction-service -> client-service")
PY

echo "  Smoke: AML alerts -> log-service-lambda (CREATE + REVIEW)"
ALERT_ID="aml-smoke-$(date +%s)"
AML_CREATE_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "${PLAYWRIGHT_BASE_URL}/api/aml/alerts" \
    --header "Authorization: Bearer ${AGENT_TOKEN}" \
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

AML_REVIEW_RESPONSE="$(
  curl --silent --show-error --fail \
    --request PUT "${PLAYWRIGHT_BASE_URL}/api/aml/alerts/${ALERT_ID}/review" \
    --header "Authorization: Bearer ${AGENT_TOKEN}" \
    --header "Content-Type: application/json" \
    --data '{"reviewStatus":"Confirmed"}'
)"
AML_REVIEW_RESPONSE_JSON="${AML_REVIEW_RESPONSE}" ${PYTHON_CMD} - <<'PY'
import json, os
payload = json.loads(os.environ["AML_REVIEW_RESPONSE_JSON"])
if payload.get("reviewStatus") != "Confirmed":
    raise SystemExit("AML review update failed")
print("  [OK] AML alert review updated")
PY

echo "  Smoke: LocalStack SQS round-trip"
QUEUE_URL="$(
  aws_local sqs get-queue-url --queue-name scroogebank-crm-dev-audit \
    --query QueueUrl --output text
)"
aws_local sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body '{"eventType":"CI_FULLSTACK_SMOKE","source":"run-fullstack-integration-e2e"}' \
  >/dev/null
RECV_BODY=""
for _ in {1..10}; do
  RECV_BODY="$(
    aws_local sqs receive-message --queue-url "${QUEUE_URL}" --wait-time-seconds 2 \
      --query 'Messages[0].Body' --output text 2>/dev/null || true
  )"
  echo "${RECV_BODY}" | grep -q "CI_FULLSTACK_SMOKE" && break
  sleep 1
done
echo "${RECV_BODY}" | grep -q "CI_FULLSTACK_SMOKE" || {
  echo "  [FAIL] SQS round-trip failed - message not received" >&2
  exit 1
}
echo "  [OK] SQS round-trip"

echo "All cross-service smoke assertions passed."
end_phase

# --------------------------------------------------------------------------
# Phase 5: Real Playwright E2E against the live stack
# --------------------------------------------------------------------------

if [[ "${FULLSTACK_MODE}" == "full" ]]; then
  start_phase "Phase 5: Playwright integration E2E"
  pushd "${INTEGRATION_TEST_DIR}" >/dev/null
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    npm ci
    npx playwright install --with-deps chromium
    PLAYWRIGHT_EXTERNAL_BASE_URL=true \
    PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
    E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
    E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin123}" \
    E2E_AGENT_PASSWORD="${E2E_AGENT_PASSWORD:-AgentPass123!}" \
    npm test
  elif command -v cmd.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
    win_integration_dir="$(wslpath -w "${INTEGRATION_TEST_DIR}")"
    cmd.exe /c "cd /d ${win_integration_dir} && npm.cmd ci"
    cmd.exe /c "cd /d ${win_integration_dir} && npx.cmd playwright install chromium"
    cmd.exe /c "cd /d ${win_integration_dir} && set PLAYWRIGHT_EXTERNAL_BASE_URL=true&& set PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL}&& set E2E_ADMIN_EMAIL=${E2E_ADMIN_EMAIL:-admin@crm.local}&& set E2E_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD:-admin123}&& set E2E_AGENT_PASSWORD=${E2E_AGENT_PASSWORD:-AgentPass123!}&& npm.cmd test"
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
else
  echo "Fullstack smoke tests passed (LocalStack + HTTP smoke; Playwright skipped)."
fi
