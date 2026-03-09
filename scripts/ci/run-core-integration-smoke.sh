#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${ROOT_DIR}/build-logs/core-integration"

mkdir -p "${LOG_DIR}"

declare -a SERVICE_PIDS=()

cleanup() {
  local exit_code=$?

  for pid in "${SERVICE_PIDS[@]:-}"; do
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done

  if [[ ${exit_code} -ne 0 ]]; then
    echo "Core integration smoke failed. Dumping recent service logs..."
    for log_file in \
      "${LOG_DIR}/log-service.log" \
      "${LOG_DIR}/client-service.log" \
      "${LOG_DIR}/transaction-service.log" \
      "${LOG_DIR}/agent-service.log"; do
      if [[ -f "${log_file}" ]]; then
        echo ""
        echo "===== $(basename "${log_file}") ====="
        tail -n 120 "${log_file}" || true
      fi
    done
  fi
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  local name="$2"
  local max_attempts="${3:-90}"

  for ((attempt=1; attempt<=max_attempts; attempt++)); do
    if curl --silent --show-error --fail "${url}" >/dev/null; then
      echo "[ready] ${name}: ${url}"
      return 0
    fi
    sleep 2
  done

  echo "[timeout] ${name} was not ready: ${url}"
  return 1
}

mint_jwt() {
  local subject="$1"
  local role="$2"

  python3 - "${subject}" "${role}" <<'PY'
import base64
import hashlib
import hmac
import json
import sys
import time

subject = sys.argv[1]
role = sys.argv[2]
secret = "dev-only-insecure-secret"

header = {"alg": "HS256", "typ": "JWT"}
payload = {
    "sub": subject,
    "role": role,
    "iat": int(time.time()),
    "exp": int(time.time()) + 3600,
}

def b64url(data):
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

header_segment = b64url(header)
payload_segment = b64url(payload)
signing_input = f"{header_segment}.{payload_segment}"
signature = hmac.new(
    secret.encode("utf-8"),
    signing_input.encode("ascii"),
    hashlib.sha256,
).digest()
signature_segment = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")

print(f"{signing_input}.{signature_segment}")
PY
}

start_log_service() {
  pushd "${ROOT_DIR}/services/backend/log" >/dev/null
  DB_HOST=127.0.0.1 \
  DB_PORT=5432 \
  DB_NAME=clients \
  DB_USER=postgres \
  DB_PASSWORD=postgres \
  JWT_HMAC_SECRET=dev-only-insecure-secret \
  python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8081 \
    >"${LOG_DIR}/log-service.log" 2>&1 &
  SERVICE_PIDS+=("$!")
  popd >/dev/null
}

start_client_service() {
  pushd "${ROOT_DIR}/services/backend/client" >/dev/null
  chmod +x gradlew
  SPRING_DATASOURCE_URL="jdbc:postgresql://127.0.0.1:5432/clients" \
  SPRING_DATASOURCE_USERNAME=postgres \
  SPRING_DATASOURCE_PASSWORD=postgres \
  LOG_SERVICE_URL="http://127.0.0.1:8081" \
  JWT_HMAC_SECRET=dev-only-insecure-secret \
  ./gradlew bootRun --no-daemon --console=plain \
    >"${LOG_DIR}/client-service.log" 2>&1 &
  SERVICE_PIDS+=("$!")
  popd >/dev/null
}

start_transaction_service() {
  pushd "${ROOT_DIR}/services/backend/transaction" >/dev/null
  chmod +x gradlew
  SERVER_PORT=8082 \
  CLIENT_SERVICE_URL="http://127.0.0.1:8080" \
  JWT_HMAC_SECRET=dev-only-insecure-secret \
  ./gradlew bootRun --no-daemon --console=plain \
    >"${LOG_DIR}/transaction-service.log" 2>&1 &
  SERVICE_PIDS+=("$!")
  popd >/dev/null
}

start_agent_service() {
  pushd "${ROOT_DIR}/services/backend/agent" >/dev/null
  chmod +x gradlew
  SERVER_PORT=8083 \
  JWT_HMAC_SECRET=dev-only-insecure-secret \
  ./gradlew bootRun --no-daemon --console=plain \
    >"${LOG_DIR}/agent-service.log" 2>&1 &
  SERVICE_PIDS+=("$!")
  popd >/dev/null
}

assert_log_written() {
  local client_id="$1"
  local bearer_token="$2"

  for _ in {1..20}; do
    local logs_json
    if logs_json="$(
      curl --silent --show-error --fail \
        "http://127.0.0.1:8081/api/logs?clientId=${client_id}" \
        -H "Authorization: Bearer ${bearer_token}"
    )"; then
      if LOGS_JSON="${logs_json}" python3 - "${client_id}" <<'PY'
import json
import os
import sys

client_id = sys.argv[1]
payload = json.loads(os.environ["LOGS_JSON"])

rows = payload.get("data", [])
matches = [
    row for row in rows
    if row.get("clientId") == client_id and row.get("action") == "CREATE"
]

if matches:
    print("ok")
    raise SystemExit(0)

raise SystemExit(1)
PY
      then
        return 0
      fi
    fi
    sleep 1
  done

  echo "Expected CREATE audit log entry not found for clientId=${client_id}"
  return 1
}

echo "Starting log, client, transaction, and agent services..."
start_log_service
wait_for_http "http://127.0.0.1:8081/health" "log-service"

start_client_service
wait_for_http "http://127.0.0.1:8080/health" "client-service"

start_transaction_service
wait_for_http "http://127.0.0.1:8082/health" "transaction-service"

start_agent_service
wait_for_http "http://127.0.0.1:8083/health" "agent-service"

AGENT_SUBJECT="usr_ci_agent"
AGENT_TOKEN="$(mint_jwt "${AGENT_SUBJECT}" "agent")"

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

echo "Validating client-service -> log-service integration..."
CREATE_RESPONSE="$(
  curl --silent --show-error --fail \
    --request POST "http://127.0.0.1:8080/api/clients" \
    --header "Authorization: Bearer ${AGENT_TOKEN}" \
    --header "Content-Type: application/json" \
    --header "X-Request-Id: ci-core-integration-001" \
    --data "${CREATE_BODY}"
)"

CLIENT_ID="$(CREATE_RESPONSE_JSON="${CREATE_RESPONSE}" python3 - <<'PY'
import json
import os

print(json.loads(os.environ["CREATE_RESPONSE_JSON"])["clientId"])
PY
)"

assert_log_written "${CLIENT_ID}" "${AGENT_TOKEN}"

echo "Validating transaction-service -> client-service integration..."
TX_RESPONSE="$(
  curl --silent --show-error --fail \
    "http://127.0.0.1:8082/api/clients/${CLIENT_ID}/transactions" \
    --header "Authorization: Bearer ${AGENT_TOKEN}"
)"

TX_RESPONSE_JSON="${TX_RESPONSE}" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["TX_RESPONSE_JSON"])
if "data" not in payload or "pagination" not in payload:
    raise SystemExit("transaction response missing expected keys")
print("ok")
PY

echo "Core integration smoke checks passed."
