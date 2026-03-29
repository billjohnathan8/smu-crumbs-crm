#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GENERATOR_SCRIPT="${ROOT_DIR}/services/backend/transaction/mock-sftp/mock_transactions.py"

ENVIRONMENT="local"
BUCKET="scroogebank-crm-dev-transaction-sftp"
KEY="manual/mocked-transactions.csv"
OUTPUT_PATH="${ROOT_DIR}/services/backend/transaction/mock-sftp/mocked_transactions.csv"
ROW_COUNT=120
SEED=301
START_TRANSACTION_ID=1000
START_DATE="2026-01-01"
END_DATE="2026-03-31"
CLIENT_IDS=""
CLIENT_ID_MODE="pool"
CLIENT_ID_COUNT=20
REGION="ap-southeast-1"
ENDPOINT_URL=""
TRIGGER_IMPORT_URL=""
AUTH_TOKEN=""
AUTH_HEADER=""
ALLOW_PROD=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/ci/seed-transaction-fixture.sh [options]

Options:
  --environment <local|dev|staging|prod>   Target environment (default: local)
  --bucket <name>                          S3 bucket name
  --key <path>                             S3 object key (default: manual/mocked-transactions.csv)
  --output <path>                          Local generated CSV path
  --row-count <n>                          Number of generated rows
  --seed <n>                               Deterministic seed
  --start-transaction-id <n>               Starting synthetic sequence number
  --start-date <YYYY-MM-DD>                Inclusive start date
  --end-date <YYYY-MM-DD>                  Inclusive end date
  --client-ids <csv>                       Comma-separated client IDs
  --client-id-mode <pool|sequential>       Client assignment mode
  --client-id-count <n>                    Auto client pool size when --client-ids not provided
  --region <aws-region>                    AWS region (default: ap-southeast-1)
  --endpoint-url <url>                     AWS endpoint URL (for LocalStack)
  --trigger-import-url <url>               Optional POST /api/transactions/import URL
  --auth-token <token>                     Optional bearer token for import API call
  --auth-header <value>                    Optional full Authorization header (overrides --auth-token)
  --allow-prod                             Allow explicit prod seeding (off by default)
  -h, --help                               Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --bucket) BUCKET="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --output) OUTPUT_PATH="$2"; shift 2 ;;
    --row-count) ROW_COUNT="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --start-transaction-id) START_TRANSACTION_ID="$2"; shift 2 ;;
    --start-date) START_DATE="$2"; shift 2 ;;
    --end-date) END_DATE="$2"; shift 2 ;;
    --client-ids) CLIENT_IDS="$2"; shift 2 ;;
    --client-id-mode) CLIENT_ID_MODE="$2"; shift 2 ;;
    --client-id-count) CLIENT_ID_COUNT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --endpoint-url) ENDPOINT_URL="$2"; shift 2 ;;
    --trigger-import-url) TRIGGER_IMPORT_URL="$2"; shift 2 ;;
    --auth-token) AUTH_TOKEN="$2"; shift 2 ;;
    --auth-header) AUTH_HEADER="$2"; shift 2 ;;
    --allow-prod) ALLOW_PROD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[FAIL] Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "${ENVIRONMENT}" == "prod" && "${ALLOW_PROD}" != "true" ]]; then
  echo "[FAIL] Refusing to seed transaction fixture in prod without --allow-prod." >&2
  exit 1
fi

if [[ "${ENVIRONMENT}" != "prod" && "${ALLOW_PROD}" == "true" ]]; then
  echo "[WARN] --allow-prod was set for non-prod environment (${ENVIRONMENT})."
fi

if [[ "${ENVIRONMENT}" == "local" && -z "${ENDPOINT_URL}" ]]; then
  ENDPOINT_URL="http://127.0.0.1:14566"
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "[FAIL] Python interpreter not found (python3/python)." >&2
  exit 1
fi

if command -v aws >/dev/null 2>&1; then
  AWS_CMD="aws"
elif command -v aws.exe >/dev/null 2>&1; then
  AWS_CMD="aws.exe"
else
  echo "[FAIL] AWS CLI not found (aws/aws.exe)." >&2
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_PATH}")"

GEN_ARGS=(
  --output "${OUTPUT_PATH}"
  --row-count "${ROW_COUNT}"
  --seed "${SEED}"
  --start-transaction-id "${START_TRANSACTION_ID}"
  --start-date "${START_DATE}"
  --end-date "${END_DATE}"
  --client-id-mode "${CLIENT_ID_MODE}"
  --client-id-count "${CLIENT_ID_COUNT}"
)
if [[ -n "${CLIENT_IDS}" ]]; then
  GEN_ARGS+=(--client-ids "${CLIENT_IDS}")
fi

"${PYTHON_CMD}" "${GENERATOR_SCRIPT}" "${GEN_ARGS[@]}"

AWS_ARGS=(--region "${REGION}")
if [[ -n "${ENDPOINT_URL}" ]]; then
  AWS_ARGS+=(--endpoint-url "${ENDPOINT_URL}")
fi

"${AWS_CMD}" "${AWS_ARGS[@]}" s3 cp "${OUTPUT_PATH}" "s3://${BUCKET}/${KEY}" >/dev/null

SOURCE_PATH="s3://${BUCKET}/${KEY}"
echo "[OK] Uploaded transaction fixture: ${SOURCE_PATH}"

if [[ -n "${TRIGGER_IMPORT_URL}" ]]; then
  CURL_HEADERS=(-H "Content-Type: application/json")
  if [[ -n "${AUTH_HEADER}" ]]; then
    CURL_HEADERS+=(-H "Authorization: ${AUTH_HEADER}")
  elif [[ -n "${AUTH_TOKEN}" ]]; then
    CURL_HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  response="$(
    curl --silent --show-error --fail \
      --request POST "${TRIGGER_IMPORT_URL}" \
      "${CURL_HEADERS[@]}" \
      --data "{\"sourcePath\":\"${SOURCE_PATH}\"}"
  )"
  echo "[OK] Triggered import API: ${TRIGGER_IMPORT_URL}"
  echo "${response}"
fi
