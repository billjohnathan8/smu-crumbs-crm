#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
LOG_DIR="${ROOT_DIR}/build-logs/fullstack-integration"
FRONTEND_DIR="${ROOT_DIR}/services/frontend/crm-ui"
INTEGRATION_TEST_DIR="${ROOT_DIR}/tests/integration"

PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:18088}"
COMPOSE_PROJECT_NAME="crm-fullstack-it-${GITHUB_RUN_ID:-local}"

# Fake creds — LocalStack accepts any non-empty value
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1
LOCALSTACK_ENDPOINT="http://127.0.0.1:14566"

mkdir -p "${LOG_DIR}"

# Detect a working Python interpreter.
# On Windows/Git Bash, `python3` may resolve to the broken Microsoft Store stub.
if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(0)" 2>/dev/null; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1 && python -c "import sys; sys.exit(0)" 2>/dev/null; then
  PYTHON_CMD="python"
else
  echo "[FAIL] No working Python interpreter found (python3 or python)" >&2
  exit 1
fi

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

  # On WSL, 'java' may not be on PATH while a Windows JDK is installed.
  # Probe known Windows install locations using globbing (safe for spaces).
  if ! command -v java >/dev/null 2>&1; then
    local _jh=""
    for _glob in \
        "/mnt/c/Users/*/AppData/Local/Programs/Eclipse Adoptium/jdk-*/bin/java.exe" \
        "/mnt/c/Program Files/Eclipse Adoptium/jdk-*/bin/java.exe" \
        "/mnt/c/Program Files/Java/jdk-*/bin/java.exe" \
        "/mnt/c/Program Files/Microsoft/jdk-*/bin/java.exe"; do
      # Expand glob without erroring if no match
      for _candidate in ${_glob}; do
        if [ -x "${_candidate}" ]; then
          _jh="${_candidate%/bin/java.exe}"
          export JAVA_HOME="${_jh}"
          export PATH="${_jh}/bin:${PATH}"
          break 2
        fi
      done
    done
  fi

  pushd "${service_dir}" >/dev/null
  chmod +x gradlew
  ./gradlew bootJar --no-daemon --console=plain \
    > "${LOG_DIR}/${service_name}-bootjar.log" 2>&1
  popd >/dev/null
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
# Phase 1: Build Java artifacts + start containerised stack
# --------------------------------------------------------------------------

echo "=== Phase 1: Build ==="
build_java_jar "${ROOT_DIR}/services/backend/agent"       "agent"
build_java_jar "${ROOT_DIR}/services/backend/client"      "client"
build_java_jar "${ROOT_DIR}/services/backend/transaction" "transaction"

echo "=== Phase 1: Start containers ==="
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" down -v --remove-orphans \
  >> "${LOG_DIR}/docker-compose.log" 2>&1 || true
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" up -d --build \
  >> "${LOG_DIR}/docker-compose.log" 2>&1

# --------------------------------------------------------------------------
# Phase 2: Wait for LocalStack + init provisioning
# --------------------------------------------------------------------------

echo ""
echo "=== Phase 2: LocalStack ==="
wait_for_http "${LOCALSTACK_ENDPOINT}/_localstack/health" "localstack"

echo "Waiting for LocalStack init provisioning (SQS sentinel)..."
INIT_ATTEMPTS=80
for i in $(seq 1 ${INIT_ATTEMPTS}); do
  aws --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 \
    sqs get-queue-url --queue-name scroogebank-crm-dev-audit >/dev/null 2>&1 && {
    echo "[OK] LocalStack provisioning complete (attempt ${i}/${INIT_ATTEMPTS})"
    break
  }
  [[ ${i} -eq ${INIT_ATTEMPTS} ]] && {
    echo "[FAIL] LocalStack init did not complete after ${INIT_ATTEMPTS} attempts" >&2
    exit 1
  }
  sleep 3
done

# --------------------------------------------------------------------------
# Phase 3: Wait for all application services to be healthy
# --------------------------------------------------------------------------

echo ""
echo "=== Phase 3: Service health ==="
wait_for_http "http://127.0.0.1:18081/health" "agent-service"
wait_for_http "http://127.0.0.1:18082/health" "client-service"
wait_for_http "http://127.0.0.1:18083/health" "transaction-service"
wait_for_http "http://127.0.0.1:18084/health" "log-service"
wait_for_http "http://127.0.0.1:18085/health" "frontend"
wait_for_http "${PLAYWRIGHT_BASE_URL}/health"  "integration-gateway"

# --------------------------------------------------------------------------
# Phase 3b: Warm up JVM + seed CI agent user
# The agent-service JVM (port 18081) only receives health-check traffic in
# Phase 3; the first real API call from Playwright would be cold.  Logging in
# here warms the JVM and also creates the agent@crm.local account that the
# Playwright agent-flow tests expect.
# --------------------------------------------------------------------------

echo ""
echo "=== Phase 3b: Warm up agent-service + seed CI agent user ==="

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

# --------------------------------------------------------------------------
# Phase 4: Cross-service HTTP smoke assertions
# Validates critical service-to-service paths against real containers +
# real LocalStack before Playwright tests run.
# --------------------------------------------------------------------------

echo ""
echo "=== Phase 4: Cross-service HTTP smoke ==="

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

echo "  Smoke: client-service -> log-service (CREATE client, assert audit log written)"
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

# Poll log-service for the CREATE audit entry (log-service writes to LocalStack / Postgres)
LOG_FOUND=false
for _ in {1..20}; do
  LOGS_JSON="$(
    curl --silent --show-error --fail \
      "http://127.0.0.1:18084/api/logs?clientId=${CLIENT_ID}" \
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

echo "  Smoke: LocalStack SQS round-trip"
QUEUE_URL="$(
  aws --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 \
    sqs get-queue-url --queue-name scroogebank-crm-dev-audit \
    --query QueueUrl --output text
)"
aws --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 \
  sqs send-message \
    --queue-url "${QUEUE_URL}" \
    --message-body '{"eventType":"CI_FULLSTACK_SMOKE","source":"run-fullstack-integration-e2e"}' \
  >/dev/null
RECV_BODY=""
for _ in {1..10}; do
  RECV_BODY="$(
    aws --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 \
      sqs receive-message --queue-url "${QUEUE_URL}" --wait-time-seconds 2 \
      --query 'Messages[0].Body' --output text 2>/dev/null || true
  )"
  echo "${RECV_BODY}" | grep -q "CI_FULLSTACK_SMOKE" && break
  sleep 1
done
echo "${RECV_BODY}" | grep -q "CI_FULLSTACK_SMOKE" || {
  echo "  [FAIL] SQS round-trip failed — message not received" >&2
  exit 1
}
echo "  [OK] SQS round-trip"

echo "All cross-service smoke assertions passed."

# --------------------------------------------------------------------------
# Phase 5: Real Playwright E2E against the live stack
# --------------------------------------------------------------------------

echo ""
echo "=== Phase 5: Playwright integration E2E ==="
pushd "${INTEGRATION_TEST_DIR}" >/dev/null
npm ci
npx playwright install --with-deps chromium
PLAYWRIGHT_EXTERNAL_BASE_URL=true \
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin123}" \
E2E_AGENT_PASSWORD="${E2E_AGENT_PASSWORD:-AgentPass123!}" \
npm test
popd >/dev/null

echo ""
echo "Fullstack integration tests passed (LocalStack + HTTP smoke + Playwright)."
