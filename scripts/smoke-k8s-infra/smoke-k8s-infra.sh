#!/usr/bin/env bash
set -euo pipefail

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

base_url=${BASE_URL:-http://localhost}
curl_base_url="${base_url}"
port_forward_pid=""
ingress_port=""
curl_host_args=()
CURL_TIMEOUT_ARGS=(--connect-timeout 2 --max-time 8)
CURL_LAST_STATUS=0
CURL_LAST_RC=0
CURL_LAST_BODY=""
CURL_LAST_ERR=""
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

# Use commands from common setup, with explicit context to avoid Docker Desktop context hijacking
if [[ -n "${KUBECTL_CONTEXT:-}" ]]; then
  KUBECTL="${KUBECTL_CMD} --context ${KUBECTL_CONTEXT}"
else
  # Auto-detect kind cluster context if KUBECTL_CONTEXT not set
  # This handles cases where smoke script is run directly from terminal
  kind_context=$(${KUBECTL_CMD} config get-contexts -o name 2>/dev/null | grep "^kind-" | head -1 || echo "")
  if [[ -n "${kind_context}" ]]; then
    echo "Auto-detected kind context: ${kind_context}"
    KUBECTL="${KUBECTL_CMD} --context ${kind_context}"
  else
    KUBECTL="${KUBECTL_CMD}"
  fi
fi

manifests_dir="${repo_root}/platform/k8s/apps/base"
ingress_yaml="${manifests_dir}/ingress.yaml"
kustomization_yaml="${manifests_dir}/kustomization.yaml"
declare -A ingress_path_by_service
declare -A probe_path_by_service
declare -A ingress_health_by_service
declare -A service_port_forward_pid
declare -A service_port_forward_port
declare -A service_port_forward_log
declare -a ingress_paths
declare -a ingress_health_paths
declare -a base_health_paths

cleanup() {
  if [[ -n "${port_forward_pid}" ]]; then
    kill "${port_forward_pid}" >/dev/null 2>&1 || true
    wait "${port_forward_pid}" >/dev/null 2>&1 || true
  fi
  local pid
  for pid in "${service_port_forward_pid[@]}"; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

parse_ingress_paths() {
  [[ -f "${ingress_yaml}" ]] || return 0
  local current_path=""
  local inside_backend=0
  local inside_service=0

  while IFS= read -r line; do
    line="${line%$'\r'}"
    if [[ "${line}" =~ ^[[:space:]]*-[[:space:]]path:[[:space:]]([^[:space:]]+) ]]; then
      current_path="${BASH_REMATCH[1]}"
      if [[ ! " ${ingress_paths[*]} " =~ " ${current_path} " ]]; then
        ingress_paths+=("${current_path}")
      fi
      inside_backend=0
      inside_service=0
      continue
    fi

    if [[ -n "${current_path}" && "${line}" =~ ^[[:space:]]*backend: ]]; then
      inside_backend=1
      continue
    fi

    if [[ ${inside_backend} -eq 1 && "${line}" =~ ^[[:space:]]*service: ]]; then
      inside_service=1
      continue
    fi

    if [[ ${inside_service} -eq 1 && "${line}" =~ ^[[:space:]]*name:[[:space:]]([^[:space:]]+) ]]; then
      local svc="${BASH_REMATCH[1]}"
      ingress_path_by_service["${svc}"]="${current_path}"
      current_path=""
      inside_backend=0
      inside_service=0
    fi
  done < "${ingress_yaml}"
}

parse_deployments() {
  [[ -f "${kustomization_yaml}" ]] || return 0
  while IFS= read -r line; do
    line="${line%$'\r'}"
    if [[ "${line}" =~ ^[[:space:]]*-[[:space:]](.+-deployment\.yaml)[[:space:]]*$ ]]; then
      local deployment_file="${manifests_dir}/${BASH_REMATCH[1]}"
      [[ -f "${deployment_file}" ]] || continue

      local svc_name
      svc_name="$(awk '
        /^[[:space:]]*metadata:/ { in_meta=1; next }
        in_meta && /^[[:space:]]*name:/ { print $2; exit }
      ' < <(tr -d '\r' < "${deployment_file}"))"

      [[ -n "${svc_name}" ]] || continue

      local readiness_path
      readiness_path="$(awk '
        $1 == "readinessProbe:" { in_probe=1; next }
        in_probe && $1 == "path:" { print $2; exit }
      ' < <(tr -d '\r' < "${deployment_file}"))"

      local liveness_path
      liveness_path="$(awk '
        $1 == "livenessProbe:" { in_probe=1; next }
        in_probe && $1 == "path:" { print $2; exit }
      ' < <(tr -d '\r' < "${deployment_file}"))"

      if [[ -n "${readiness_path}" ]]; then
        probe_path_by_service["${svc_name}"]="${readiness_path}"
      elif [[ -n "${liveness_path}" ]]; then
        probe_path_by_service["${svc_name}"]="${liveness_path}"
      else
        probe_path_by_service["${svc_name}"]="/health"
      fi
    fi
  done < "${kustomization_yaml}"
}

build_health_checks() {
  parse_ingress_paths
  parse_deployments

  local candidate
  for candidate in /health /api/v1/health; do
    if [[ " ${ingress_paths[*]} " =~ " ${candidate} " ]] && [[ ! " ${base_health_paths[*]} " =~ " ${candidate} " ]]; then
      base_health_paths+=("${candidate}")
    fi
  done

  local svc
  for svc in "${!probe_path_by_service[@]}"; do
    local probe_path="${probe_path_by_service[${svc}]}"
    local ingress_path="${ingress_path_by_service[${svc}]:-}"
    local ingress_health=""

    if [[ -n "${ingress_path}" ]]; then
      if [[ "${probe_path}" == "${ingress_path}" || "${probe_path}" == ${ingress_path}* ]]; then
        ingress_health="${probe_path}"
      elif [[ "${ingress_path}" == */health ]]; then
        ingress_health="${ingress_path}"
      else
        ingress_health=""
      fi
      if [[ -n "${ingress_health}" ]] && [[ ! " ${ingress_health_paths[*]} " =~ " ${ingress_health} " ]]; then
        ingress_health_paths+=("${ingress_health}")
      fi
    fi

    ingress_health_by_service["${svc}"]="${ingress_health}"
  done
}

port_in_use() {
  local port="$1"
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >/dev/null 2>&1
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP -sTCP:LISTEN -P | grep -q ":${port} "
    return $?
  fi
  return 1
}

find_free_port() {
  local start="$1"
  local end="$2"
  local port
  for ((port=start; port<=end; port++)); do
    if ! port_in_use "$port"; then
      echo "$port"
      return 0
    fi
  done
  echo "$start"
}

base64_url() {
  openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

mint_jwt() {
  local secret="${JWT_HMAC_SECRET:-dev-only-insecure-secret}"
  local now
  now="$(date +%s)"
  local exp=$((now + 3600))
  local header='{"alg":"HS256","typ":"JWT"}'
  local payload
  payload=$(printf '{"sub":"%s","role":"agent","iat":%s,"exp":%s}' "agent-smoke" "${now}" "${exp}")
  local header_b64
  header_b64="$(printf '%s' "${header}" | base64_url)"
  local payload_b64
  payload_b64="$(printf '%s' "${payload}" | base64_url)"
  local signing_input="${header_b64}.${payload_b64}"
  local sig
  sig="$(printf '%s' "${signing_input}" | openssl dgst -sha256 -hmac "${secret}" -binary | base64_url)"
  printf '%s.%s' "${signing_input}" "${sig}"
}

curl_request() {
  local err_file
  local body_file
  err_file="$(mktemp 2>/dev/null || echo /tmp/smoke-curl.err)"
  body_file="$(mktemp 2>/dev/null || echo /tmp/smoke-curl.body)"
  local status
  status=$(curl -sS "${CURL_TIMEOUT_ARGS[@]}" -o "${body_file}" -w "%{http_code}" "$@" 2>"${err_file}")
  CURL_LAST_RC=$?
  CURL_LAST_STATUS=0
  if [[ ${CURL_LAST_RC} -eq 0 && "${status}" =~ ^[0-9]{3}$ ]]; then
    CURL_LAST_STATUS=${status}
  fi
  if [[ -f "${body_file}" ]]; then
    CURL_LAST_BODY="$(cat "${body_file}")"
  else
    CURL_LAST_BODY=""
  fi
  if [[ -f "${err_file}" ]]; then
    CURL_LAST_ERR="$(head -n 1 "${err_file}" | tr -d '\r')"
  else
    CURL_LAST_ERR=""
  fi
  rm -f "${body_file}" "${err_file}" >/dev/null 2>&1 || true
}

assert_http_success() {
  local action="$1"
  if [[ ${CURL_LAST_RC} -ne 0 || ${CURL_LAST_STATUS} -lt 200 || ${CURL_LAST_STATUS} -ge 300 ]]; then
    echo "${action} (status: ${CURL_LAST_STATUS}, curl exit: ${CURL_LAST_RC})"
    if [[ -n "${CURL_LAST_ERR}" ]]; then
      echo "curl error: ${CURL_LAST_ERR}"
    fi
    if [[ -n "${CURL_LAST_BODY}" ]]; then
      local body="${CURL_LAST_BODY}"
      if [[ ${#body} -gt 2000 ]]; then
        body="${body:0:2000}... (truncated)"
      fi
      echo "response body: ${body}"
    fi
    return 1
  fi
  return 0
}

start_service_port_forward() {
  local svc="$1"
  local probe_path="$2"

  if [[ -n "${service_port_forward_pid[${svc}]:-}" ]]; then
    if kill -0 "${service_port_forward_pid[${svc}]}" >/dev/null 2>&1; then
      echo "${service_port_forward_port[${svc}]}"
      return 0
    fi
  fi

  local fallback_port
  fallback_port="$(find_free_port 18110 18220)"
  local log_file
  log_file="$(mktemp 2>/dev/null || echo "/tmp/smoke-${svc}-port-forward.log")"
  ${KUBECTL} -n dev port-forward "svc/${svc}" "${fallback_port}:80" >"${log_file}" 2>&1 &
  local pid=$!

  service_port_forward_pid["${svc}"]="${pid}"
  service_port_forward_port["${svc}"]="${fallback_port}"
  service_port_forward_log["${svc}"]="${log_file}"

  local err_file
  err_file="$(mktemp 2>/dev/null || echo "/tmp/smoke-${svc}-curl.err")"
  local last_rc=0
  local last_err=""
  for i in {1..20}; do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      break
    fi
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" --max-time 2 "http://localhost:${fallback_port}${probe_path}" >/dev/null 2>"${err_file}"; then
      echo "${fallback_port}"
      rm -f "${err_file}" >/dev/null 2>&1 || true
      return 0
    fi
    last_rc=$?
    if [[ -f "${err_file}" ]]; then
      last_err="$(head -n 1 "${err_file}" | tr -d '\r')"
    else
      last_err=""
    fi
    if [[ ${i} -eq 5 || ${i} -eq 10 || ${i} -eq 20 ]]; then
      if [[ -n "${last_err}" ]]; then
        echo "Waiting for ${svc} health at ${probe_path} (curl exit: ${last_rc}, error: ${last_err})"
      else
        echo "Waiting for ${svc} health at ${probe_path} (curl exit: ${last_rc})"
      fi
    fi
    sleep 1
  done
  rm -f "${err_file}" >/dev/null 2>&1 || true

  echo "Failed to establish port-forward for ${svc}. Logs:"
  if [[ -n "${last_err}" ]]; then
    echo "Last curl error for ${svc}: exit ${last_rc}, ${last_err}"
  fi
  cat "${log_file}" || true
  return 1
}

post_log_event() {
  local client_id="$1"
  local token
  token="$(mint_jwt)"
  local auth_header=("Authorization: Bearer ${token}")
  local log_ingress_path="${ingress_path_by_service[log]:-}"
  local log_payload
  log_payload=$(cat <<'JSON'
{
  "action": "COMMUNICATION",
  "attributeName": "smoke-test",
  "afterValue": "smoke test completed",
  "agentId": "agent-smoke",
  "clientId": "__CLIENT_ID__",
  "correlationId": "smoke-test"
}
JSON
)
  log_payload="${log_payload/__CLIENT_ID__/${client_id}}"

  if [[ -n "${log_ingress_path}" ]]; then
    curl_request "${curl_host_args[@]}" -X POST "${curl_base_url}${log_ingress_path}" \
      -H "Content-Type: application/json" \
      -H "${auth_header[0]}" \
      --data-binary @- <<<"${log_payload}"
    if assert_http_success "Failed to post log event via ingress."; then
      return 0
    fi
  fi

  local probe_path="${probe_path_by_service[log]:-/health}"
  local port
  port="$(start_service_port_forward "log" "${probe_path}")"
  curl_request -X POST "http://localhost:${port}/api/logs" \
    -H "Content-Type: application/json" \
    -H "${auth_header[0]}" \
    --data-binary @- <<<"${log_payload}"
  assert_http_success "Failed to post log event."
}

can_reach_base() {
  local path
  local -a paths_to_check=("${base_health_paths[@]}")
  if [[ ${#paths_to_check[@]} -eq 0 ]]; then
    paths_to_check=("${ingress_health_paths[@]}")
  fi
  for path in "${paths_to_check[@]}"; do
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" --max-time 4 "${curl_host_args[@]}" "${curl_base_url}${path}" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

tcp_connect() {
  local host="$1"
  local port="$2"
  local timeout_ms="${3:-500}"
  # Find a working Python (python3 may be a broken Windows App Store stub)
  local py_cmd=""
  if command -v python3 >/dev/null 2>&1 && python3 -c "import sys" >/dev/null 2>&1; then
    py_cmd="python3"
  elif command -v python >/dev/null 2>&1 && python -c "import sys" >/dev/null 2>&1; then
    py_cmd="python"
  fi
  if [[ -n "${py_cmd}" ]]; then
    ${py_cmd} - <<PY >/dev/null 2>&1
import socket, sys
host="${host}"
port=int("${port}")
timeout=${timeout_ms}/1000.0
try:
    s=socket.socket()
    s.settimeout(timeout)
    s.connect((host, port))
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 1 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1
    return $?
  fi
  # Last resort: try bash /dev/tcp directly (works in Git Bash)
  bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1
  return $?
}

start_port_forward_fallback() {
  local fallback_port
  fallback_port="$(find_free_port 18080 18100)"
  local log_file
  log_file="$(mktemp 2>/dev/null || echo /tmp/smoke-port-forward.log)"
  ${KUBECTL} -n ingress-nginx port-forward svc/ingress-nginx-controller "${fallback_port}:80" >"${log_file}" 2>&1 &
  port_forward_pid=$!

  for _ in {1..20}; do
    if ! kill -0 "${port_forward_pid}" >/dev/null 2>&1; then
      break
    fi

    base_url="http://localhost:${fallback_port}"
    curl_base_url="${base_url}"
    curl_host_args=(-H "Host: localhost")
    if tcp_connect "localhost" "${fallback_port}" 500; then
      ingress_port="${fallback_port}"
      echo "Using ${KUBECTL} port-forward fallback at ${base_url}"
      if ! can_reach_base; then
        echo "Port-forward established but base health check failed for ${base_url}."
      fi
      return 0
    fi
    sleep 1
  done

  echo "Failed to establish fallback port-forward. Logs:"
  cat "${log_file}" || true
  return 1
}

declare -A probe_path_by_service=()
declare -A ingress_path_by_service=()
declare -A ingress_health_by_service=()
declare -A service_port_forward_pid=()
declare -A service_port_forward_port=()
declare -A service_port_forward_log=()
declare -a ingress_paths=()
declare -a ingress_health_paths=()
declare -a base_health_paths=()

build_health_checks
if [[ ${#probe_path_by_service[@]} -eq 0 ]]; then
  echo "No health checks discovered from ${manifests_dir}."
  exit 1
fi

if [[ "${SMOKE_VALIDATE_ONLY:-0}" == "1" ]]; then
  echo "Discovered ${#probe_path_by_service[@]} service health checks from manifests; skipping runtime smoke tests."
  exit 0
fi

if [[ ${#ingress_paths[@]} -gt 0 ]]; then
  if ! can_reach_base; then
    echo "Initial health check against ${base_url} failed; attempting ${KUBECTL} port-forward fallback..."
    start_port_forward_fallback
  fi
else
  echo "No ingress-exposed services discovered; skipping ingress base check."
fi

echo "Checking health endpoints..."
for svc in "${!probe_path_by_service[@]}"; do
  probe_path="${probe_path_by_service[${svc}]}"
  ingress_health="${ingress_health_by_service[${svc}]:-}"
  healthy=0

  if [[ -n "${ingress_health}" ]]; then
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" "${curl_host_args[@]}" "${curl_base_url}${ingress_health}" >/dev/null; then
      echo "Healthy (ingress): ${svc} (${ingress_health})"
      healthy=1
    else
      echo "Ingress health check failed for ${svc} (${ingress_health}); trying direct port-forward..."
    fi
  else
    echo "No ingress path for ${svc}; using direct port-forward..."
  fi

  if [[ ${healthy} -eq 0 ]]; then
    port="$(start_service_port_forward "${svc}" "${probe_path}")"
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" --max-time 4 "http://localhost:${port}${probe_path}" >/dev/null; then
      echo "Healthy (port-forward): ${svc} (${probe_path})"
      healthy=1
    fi
  fi

  if [[ ${healthy} -eq 0 ]]; then
    echo "Unhealthy: ${svc} (${probe_path})"
    exit 1
  fi
done

if [[ -n "${probe_path_by_service[transaction]:-}" ]]; then
  echo "Listing transactions..."
  token="$(mint_jwt)"
  auth_header="Authorization: Bearer ${token}"
  if [[ -n "${ingress_path_by_service[transaction]:-}" ]]; then
    curl_request "${curl_host_args[@]}" -H "${auth_header}" \
      "${curl_base_url}/api/transactions?limit=1"
    assert_http_success "Failed to list transactions." || exit 1
  else
    port="$(start_service_port_forward "transaction" "${probe_path_by_service[transaction]}")"
    curl_request -H "${auth_header}" \
      "http://localhost:${port}/api/transactions?limit=1"
    assert_http_success "Failed to list transactions." || exit 1
  fi
fi

echo "Creating client..."
token="$(mint_jwt)"
auth_header="Authorization: Bearer ${token}"
client_payload=$(cat <<'JSON'
{
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
}
JSON
)
curl_request "${curl_host_args[@]}" -X POST "$curl_base_url/api/clients" \
  -H "Content-Type: application/json" \
  -H "${auth_header}" \
  --data-binary @- <<<"${client_payload}"
if ! assert_http_success "Failed to create client."; then
  exit 1
fi
create_response="${CURL_LAST_BODY}"

client_id=$(echo "$create_response" | sed -n 's/.*"clientId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [[ -z "$client_id" ]]; then
  echo "Could not parse clientId from create response: $create_response"
  exit 1
fi

echo "Reading client $client_id..."
curl_request "${curl_host_args[@]}" -H "${auth_header}" "$curl_base_url/api/clients/$client_id"
assert_http_success "Failed to read client ${client_id}." || exit 1

echo "Updating client $client_id..."
update_payload=$(cat <<'JSON'
{
  "firstName": "Jordan",
  "lastName": "Taylor",
  "dateOfBirth": "1990-01-15",
  "gender": "Male",
  "emailAddress": "jordan.taylor@example.com",
  "phoneNumber": "+15551234567",
  "address": "99 Updated Street",
  "city": "Springfield",
  "state": "Illinois",
  "country": "United States",
  "postalCode": "62704"
}
JSON
)
curl_request "${curl_host_args[@]}" -X PUT "$curl_base_url/api/clients/$client_id" \
  -H "Content-Type: application/json" \
  -H "${auth_header}" \
  --data-binary @- <<<"${update_payload}"
assert_http_success "Failed to update client ${client_id}." || exit 1

echo "Deleting client $client_id..."
curl_request "${curl_host_args[@]}" -X DELETE "$curl_base_url/api/clients/$client_id" \
  -H "${auth_header}"
assert_http_success "Failed to delete client ${client_id}." || exit 1

echo "Posting a direct log event..."
post_log_event "${client_id}"

echo "Smoke tests passed."

