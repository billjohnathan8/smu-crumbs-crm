#!/usr/bin/env bash
set -euo pipefail

base_url=${BASE_URL:-http://localhost}
port_forward_pid=""
curl_host_args=()

cleanup() {
  if [[ -n "${port_forward_pid}" ]]; then
    kill "${port_forward_pid}" >/dev/null 2>&1 || true
    wait "${port_forward_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

can_reach_base() {
  curl -fsS --max-time 4 "${curl_host_args[@]}" "${base_url}/api/v1/users/health" >/dev/null 2>&1
}

start_port_forward_fallback() {
  local fallback_port=18080
  local log_file
  log_file="$(mktemp 2>/dev/null || echo /tmp/smoke-port-forward.log)"
  kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller "${fallback_port}:80" >"${log_file}" 2>&1 &
  port_forward_pid=$!

  for _ in {1..20}; do
    if ! kill -0 "${port_forward_pid}" >/dev/null 2>&1; then
      break
    fi

    if curl -fsS --max-time 2 -H "Host: localhost" "http://localhost:${fallback_port}/api/v1/users/health" >/dev/null 2>&1; then
      base_url="http://localhost:${fallback_port}"
      curl_host_args=(-H "Host: localhost")
      echo "Using kubectl port-forward fallback at ${base_url}"
      return 0
    fi
    sleep 1
  done

  echo "Failed to establish fallback port-forward. Logs:"
  cat "${log_file}" || true
  return 1
}

if ! can_reach_base; then
  echo "Initial health check against ${base_url} failed; attempting kubectl port-forward fallback..."
  start_port_forward_fallback
fi

echo "Checking health endpoints..."
curl -fsS "${curl_host_args[@]}" "$base_url/api/v1/users/health" >/dev/null
curl -fsS "${curl_host_args[@]}" "$base_url/api/v1/clients/health" >/dev/null
curl -fsS "${curl_host_args[@]}" "$base_url/api/v1/logs/health" >/dev/null

echo "Creating client..."
create_response=$(curl -fsS "${curl_host_args[@]}" -X POST "$base_url/api/v1/clients" \
  -H "Content-Type: application/json" \
  -d '{
    "client": {
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
    },
    "agentId": "agent-smoke"
  }')

client_id=$(echo "$create_response" | sed -n 's/.*"clientId"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p')
if [[ -z "$client_id" ]]; then
  echo "Could not parse clientId from create response: $create_response"
  exit 1
fi

echo "Reading client $client_id..."
curl -fsS "${curl_host_args[@]}" "$base_url/api/v1/clients/$client_id" >/dev/null

echo "Updating client $client_id..."
curl -fsS "${curl_host_args[@]}" -X PUT "$base_url/api/v1/clients/$client_id" \
  -H "Content-Type: application/json" \
  -d '{
    "client": {
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
    },
    "agentId": "agent-smoke"
  }' >/dev/null

echo "Deleting client $client_id..."
curl -fsS "${curl_host_args[@]}" -X DELETE "$base_url/api/v1/clients/$client_id" >/dev/null

echo "Posting a direct log event..."
curl -fsS "${curl_host_args[@]}" -X POST "$base_url/api/v1/logs" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "smoke-test",
    "action": "VERIFY",
    "entityType": "SYSTEM",
    "message": "smoke test completed"
  }' >/dev/null

echo "Smoke tests passed."
