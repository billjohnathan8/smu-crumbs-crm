#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-}"
ROOT_ADMIN_EMAIL="${ROOT_ADMIN_EMAIL:-admin@crm.com}"
ROOT_ADMIN_PASSWORD="${ROOT_ADMIN_PASSWORD:-}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-900}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-10}"

SEED_USERS_COUNT="${SEED_USERS_COUNT:-3}"
SEED_CLIENTS_COUNT="${SEED_CLIENTS_COUNT:-6}"
SEED_USER_EMAIL_PREFIX="${SEED_USER_EMAIL_PREFIX:-bootstrap.agent}"
SEED_CLIENT_EMAIL_PREFIX="${SEED_CLIENT_EMAIL_PREFIX:-bootstrap.client}"
SEED_USER_TEMP_PASSWORD="${SEED_USER_TEMP_PASSWORD:-}"

RUN_TRANSACTION_SEED="${RUN_TRANSACTION_SEED:-true}"
RUN_SFTP_UPLOAD="${RUN_SFTP_UPLOAD:-true}"
TRANSACTION_ROW_COUNT="${TRANSACTION_ROW_COUNT:-120}"
TRANSACTION_S3_BUCKET="${TRANSACTION_S3_BUCKET:-}"
TRANSACTION_S3_KEY="${TRANSACTION_S3_KEY:-manual/bootstrap-transactions.csv}"
SFTP_ENDPOINT="${SFTP_ENDPOINT:-}"
SFTP_USERNAME="${SFTP_USERNAME:-crm-transaction-uploader}"
SFTP_PRIVATE_KEY_PATH="${SFTP_PRIVATE_KEY_PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -z "${API_BASE_URL}" ]]; then
  echo "[FAIL] API_BASE_URL is required." >&2
  exit 1
fi
if [[ -z "${ROOT_ADMIN_PASSWORD}" ]]; then
  echo "[FAIL] ROOT_ADMIN_PASSWORD is required." >&2
  exit 1
fi
if [[ "${SEED_USERS_COUNT}" != "0" && -z "${SEED_USER_TEMP_PASSWORD}" ]]; then
  echo "[FAIL] SEED_USER_TEMP_PASSWORD is required when SEED_USERS_COUNT is not 0." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "[FAIL] jq is required." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "[FAIL] curl is required." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
  echo "[FAIL] python3/python is required." >&2
  exit 1
fi

trim_trailing_slash() {
  local v="$1"
  while [[ "${v}" == */ ]]; do
    v="${v%/}"
  done
  printf '%s' "${v}"
}

API_BASE_URL="$(trim_trailing_slash "${API_BASE_URL}")"

to_bool() {
  local v
  v="$(echo "${1:-false}" | tr '[:upper:]' '[:lower:]')"
  [[ "${v}" == "1" || "${v}" == "true" || "${v}" == "yes" || "${v}" == "y" ]]
}

http_code() {
  local method="$1"
  local url="$2"
  local auth="${3:-}"
  local body="${4:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a args
  args=(--silent --show-error --output "${tmp_file}" --write-out "%{http_code}" --request "${method}" "${url}" -H "Content-Type: application/json")
  if [[ -n "${auth}" ]]; then
    args+=(-H "Authorization: Bearer ${auth}")
  fi
  if [[ -n "${body}" ]]; then
    args+=(--data "${body}")
  fi

  local code
  code="$(curl "${args[@]}" || true)"
  cat "${tmp_file}" >"${tmp_file}.body"
  rm -f "${tmp_file}"

  printf '%s|%s' "${code}" "${tmp_file}.body"
}

wait_for_health() {
  local deadline
  deadline=$((SECONDS + WAIT_TIMEOUT_SECONDS))
  local endpoints=(
    "/api/user/health"
    "/api/clients/health"
    "/api/transactions/health"
  )

  echo "[INFO] Waiting for service health checks..."
  while (( SECONDS < deadline )); do
    local all_ok=true
    for path in "${endpoints[@]}"; do
      local code
      code="$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" "${API_BASE_URL}${path}" || true)"
      if [[ "${code}" != "200" ]]; then
        all_ok=false
        echo "[INFO] Health pending: ${path} -> HTTP ${code}"
      fi
    done

    if [[ "${all_ok}" == "true" ]]; then
      echo "[OK] All health checks are passing."
      return 0
    fi
    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
  done

  echo "[FAIL] Timed out waiting for service health after ${WAIT_TIMEOUT_SECONDS}s." >&2
  exit 1
}

api_post() {
  local path="$1"
  local token="$2"
  local body="$3"
  local response
  response="$(http_code "POST" "${API_BASE_URL}${path}" "${token}" "${body}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  echo "${code}|${body_file}"
}

api_get() {
  local path="$1"
  local token="$2"
  local response
  response="$(http_code "GET" "${API_BASE_URL}${path}" "${token}" "")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  echo "${code}|${body_file}"
}

login_admin() {
  local payload
  payload="$(jq -cn --arg e "${ROOT_ADMIN_EMAIL}" --arg p "${ROOT_ADMIN_PASSWORD}" '{email:$e,password:$p}')"

  local response
  response="$(api_post "/api/auth/login" "" "${payload}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"

  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] Admin login failed (HTTP ${code})." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi

  local token
  token="$(jq -r '.accessToken // empty' <"${body_file}")"
  rm -f "${body_file}"
  if [[ -z "${token}" ]]; then
    echo "[FAIL] Login succeeded but accessToken is missing." >&2
    exit 1
  fi
  printf '%s' "${token}"
}

seed_users() {
  local token="$1"

  local response
  response="$(api_get "/api/users?role=user&limit=500&offset=0" "${token}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] Unable to list users (HTTP ${code})." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi

  local existing_emails
  existing_emails="$(jq -r '.data[]?.email // empty | ascii_downcase' <"${body_file}")"
  rm -f "${body_file}"

  for i in $(seq 1 "${SEED_USERS_COUNT}"); do
    local email
    email="$(printf '%s%02d@example.test' "${SEED_USER_EMAIL_PREFIX}" "${i}")"
    if grep -qxF "$(echo "${email}" | tr '[:upper:]' '[:lower:]')" <<<"${existing_emails}"; then
      echo "[seed-user] Exists: ${email}"
      continue
    fi

    local payload
    payload="$(jq -cn \
      --arg fn "Seed${i}" \
      --arg ln "Agent${i}" \
      --arg em "${email}" \
      --arg pwd "${SEED_USER_TEMP_PASSWORD}" \
      '{firstName:$fn,lastName:$ln,email:$em,role:"user",sendInviteEmail:false,temporaryPassword:$pwd}')"

    local create_resp
    create_resp="$(api_post "/api/users" "${token}" "${payload}")"
    local create_code="${create_resp%%|*}"
    local create_body_file="${create_resp#*|}"

    case "${create_code}" in
      201)
        echo "[seed-user] Created: ${email}"
        ;;
      409)
        echo "[seed-user] Already exists by API: ${email}"
        ;;
      *)
        echo "[FAIL] Failed creating user ${email} (HTTP ${create_code})." >&2
        cat "${create_body_file}" >&2 || true
        rm -f "${create_body_file}"
        exit 1
        ;;
    esac
    rm -f "${create_body_file}"
  done
}

refresh_agent_ids() {
  local token="$1"
  local response
  response="$(api_get "/api/users?role=user&limit=500&offset=0" "${token}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] Unable to list users for assignments (HTTP ${code})." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi

  jq -r '.data[]? | select(.status == "active") | .id' <"${body_file}"
  rm -f "${body_file}"
}

seed_clients() {
  local token="$1"
  local -a agent_ids=("$@")
  agent_ids=("${agent_ids[@]:1}")

  local response
  response="$(api_get "/api/clients?limit=1000&offset=0" "${token}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] Unable to list clients (HTTP ${code})." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi

  local existing_emails
  existing_emails="$(jq -r '.data[]?.emailAddress // empty | ascii_downcase' <"${body_file}")"
  rm -f "${body_file}"

  for i in $(seq 1 "${SEED_CLIENTS_COUNT}"); do
    local email phone assigned_user
    email="$(printf '%s%02d@example.test' "${SEED_CLIENT_EMAIL_PREFIX}" "${i}")"
    phone="$(printf '+6591234%04d' "${i}")"
    assigned_user=""
    if (( ${#agent_ids[@]} > 0 )); then
      assigned_user="${agent_ids[$(((i - 1) % ${#agent_ids[@]}))]}"
    fi

    if grep -qxF "$(echo "${email}" | tr '[:upper:]' '[:lower:]')" <<<"${existing_emails}"; then
      echo "[seed-client] Exists: ${email}"
      continue
    fi

    local payload
    payload="$(jq -cn \
      --arg fn "Client${i}" \
      --arg ln "Seed${i}" \
      --arg dob "1990-01-01" \
      --arg gender "Prefer not to say" \
      --arg em "${email}" \
      --arg ph "${phone}" \
      --arg addr "1 Seed Street" \
      --arg city "Singapore" \
      --arg state "Singapore" \
      --arg country "Singapore" \
      --arg postal "018989" \
      --arg assigned "${assigned_user}" \
      '{
        firstName:$fn,lastName:$ln,dateOfBirth:$dob,gender:$gender,emailAddress:$em,
        phoneNumber:$ph,address:$addr,city:$city,state:$state,country:$country,postalCode:$postal
      } + (if $assigned == "" then {} else {assignedUserId:$assigned} end)')"

    local create_resp
    create_resp="$(api_post "/api/clients" "${token}" "${payload}")"
    local create_code="${create_resp%%|*}"
    local create_body_file="${create_resp#*|}"

    case "${create_code}" in
      200|201)
        echo "[seed-client] Created: ${email}"
        ;;
      409)
        echo "[seed-client] Already exists by API: ${email}"
        ;;
      *)
        echo "[FAIL] Failed creating client ${email} (HTTP ${create_code})." >&2
        cat "${create_body_file}" >&2 || true
        rm -f "${create_body_file}"
        exit 1
        ;;
    esac
    rm -f "${create_body_file}"
  done
}

collect_seed_client_ids() {
  local token="$1"
  local response
  response="$(api_get "/api/clients?limit=1000&offset=0" "${token}")"
  local code="${response%%|*}"
  local body_file="${response#*|}"
  if [[ "${code}" != "200" ]]; then
    echo "[FAIL] Unable to list clients for transaction seeding (HTTP ${code})." >&2
    cat "${body_file}" >&2 || true
    rm -f "${body_file}"
    exit 1
  fi

  local regex
  regex="^${SEED_CLIENT_EMAIL_PREFIX}[0-9]{2}@example\\.test$"
  jq -r --arg re "${regex}" '.data[]? | select((.emailAddress // "") | test($re; "i")) | .clientId' <"${body_file}"
  rm -f "${body_file}"
}

main() {
  wait_for_health
  local token
  token="$(login_admin)"
  echo "[OK] Admin login succeeded."

  seed_users "${token}"

  mapfile -t agent_ids < <(refresh_agent_ids "${token}")
  if (( ${#agent_ids[@]} == 0 )); then
    echo "[WARN] No active agents found. Clients will be created without explicit assignment."
  fi

  seed_clients "${token}" "${agent_ids[@]}"

  mapfile -t client_ids < <(collect_seed_client_ids "${token}")
  if (( ${#client_ids[@]} == 0 )); then
    echo "[FAIL] No seeded clients found; cannot seed transactions or SFTP upload." >&2
    exit 1
  fi

  local client_ids_csv
  client_ids_csv="$(IFS=, ; echo "${client_ids[*]}")"
  local csv_path
  csv_path="${RUNNER_TEMP:-/tmp}/bootstrap-transactions-${GITHUB_RUN_ID:-manual}.csv"

  if to_bool "${RUN_TRANSACTION_SEED}"; then
    if [[ -z "${TRANSACTION_S3_BUCKET}" ]]; then
      echo "[FAIL] TRANSACTION_S3_BUCKET is required when RUN_TRANSACTION_SEED=true." >&2
      exit 1
    fi

    bash "${ROOT_DIR}/scripts/ci/seed-transaction-fixture.sh" \
      --environment prod \
      --allow-prod \
      --bucket "${TRANSACTION_S3_BUCKET}" \
      --key "${TRANSACTION_S3_KEY}" \
      --output "${csv_path}" \
      --row-count "${TRANSACTION_ROW_COUNT}" \
      --client-ids "${client_ids_csv}" \
      --trigger-import-url "${API_BASE_URL}/api/transactions/import" \
      --auth-token "${token}"
    echo "[OK] Transaction fixture seeded to S3 and import triggered."
  else
    local py_cmd
    py_cmd="python3"
    if ! command -v python3 >/dev/null 2>&1; then
      py_cmd="python"
    fi
    "${py_cmd}" "${ROOT_DIR}/sftp/mock_transactions.py" \
      --output "${csv_path}" \
      --row-count 30 \
      --seed 301 \
      --start-transaction-id 1000 \
      --start-date 2026-01-01 \
      --end-date 2026-01-31 \
      --client-ids "${client_ids_csv}"
  fi

  if to_bool "${RUN_SFTP_UPLOAD}"; then
    if [[ -z "${SFTP_ENDPOINT}" || -z "${SFTP_PRIVATE_KEY_PATH}" ]]; then
      echo "[FAIL] SFTP_ENDPOINT and SFTP_PRIVATE_KEY_PATH are required when RUN_SFTP_UPLOAD=true." >&2
      exit 1
    fi
    bash "${ROOT_DIR}/scripts/ci/upload-via-sftp.sh" \
      --file "${csv_path}" \
      --sftp-endpoint "${SFTP_ENDPOINT}" \
      --sftp-username "${SFTP_USERNAME}" \
      --ssh-key "${SFTP_PRIVATE_KEY_PATH}" \
      --remote-filename "bootstrap-${GITHUB_RUN_ID:-manual}.csv"
    echo "[OK] SFTP upload completed."
  fi

  echo "[SUCCESS] Post-apply bootstrap completed."
}

main "$@"
