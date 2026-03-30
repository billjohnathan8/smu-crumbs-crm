#!/usr/bin/env bash
set -euo pipefail

#--------------------------------------------------------------
# Upload Transaction CSV to AWS Transfer Family SFTP Endpoint
#
# This script uploads a transaction CSV file to the AWS Transfer Family
# SFTP server using SSH key authentication. The file lands in the S3
# transaction bucket where the existing collector/import flow processes it.
#
# Prerequisites:
#   - SSH key pair generated (ssh-keygen -t rsa -b 4096)
#   - SSH public key registered in Terraform (sftp_user_ssh_public_key variable)
#   - Transfer Family server deployed (enable_transfer_family_sftp = true)
#   - sftp command available (OpenSSH client)
#
# Usage:
#   bash scripts/ci/upload-via-transfer-family.sh \
#     --file ./transactions.csv \
#     --sftp-endpoint s-abc123.server.transfer.ap-southeast-1.amazonaws.com \
#     --sftp-username crm-transaction-uploader \
#     --ssh-key ~/.ssh/crm-sftp-demo \
#     --remote-filename transactions-2026-03.csv
#--------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FILE_PATH=""
SFTP_ENDPOINT=""
SFTP_USERNAME="crm-transaction-uploader"
SSH_KEY_PATH="$HOME/.ssh/crm-sftp-demo"
REMOTE_FILENAME=""
STRICT_HOST_KEY_CHECKING="no"
TRIGGER_IMPORT_URL=""
AUTH_TOKEN=""
AUTH_HEADER=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/ci/upload-via-transfer-family.sh [options]

Required Options:
  --file <path>               Local CSV file to upload
  --sftp-endpoint <endpoint>  AWS Transfer Family SFTP endpoint (e.g., s-abc123.server.transfer.us-east-1.amazonaws.com)

Optional Options:
  --sftp-username <username>  SFTP username (default: crm-transaction-uploader)
  --ssh-key <path>            Path to SSH private key (default: ~/.ssh/crm-sftp-demo)
  --remote-filename <name>    Remote filename (default: basename of --file)
  --strict-host-key-checking  Enable SSH strict host key checking (default: disabled for automation)
  --trigger-import-url <url>  Optional POST /api/transactions/import URL
  --auth-token <token>        Optional bearer token for import API call
  --auth-header <value>       Optional full Authorization header (overrides --auth-token)
  -h, --help                  Show help

Examples:
  # Basic upload
  bash scripts/ci/upload-via-transfer-family.sh \
    --file ./mocked_transactions.csv \
    --sftp-endpoint s-abc123.server.transfer.ap-southeast-1.amazonaws.com

  # Upload with custom remote filename
  bash scripts/ci/upload-via-transfer-family.sh \
    --file ./data.csv \
    --sftp-endpoint s-abc123.server.transfer.ap-southeast-1.amazonaws.com \
    --remote-filename transactions-2026-03.csv

  # Upload and trigger import API
  bash scripts/ci/upload-via-transfer-family.sh \
    --file ./data.csv \
    --sftp-endpoint s-abc123.server.transfer.ap-southeast-1.amazonaws.com \
    --trigger-import-url https://crm-alb.example.com/api/transactions/import \
    --auth-token "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

  # Retrieve SFTP endpoint from Terraform outputs
  cd platform/terraform
  SFTP_ENDPOINT=$(terraform output -raw sftp_endpoint)
  SFTP_USERNAME=$(terraform output -raw sftp_username)
  cd ../..
  bash scripts/ci/upload-via-transfer-family.sh \
    --file ./data.csv \
    --sftp-endpoint "$SFTP_ENDPOINT" \
    --sftp-username "$SFTP_USERNAME"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE_PATH="$2"; shift 2 ;;
    --sftp-endpoint) SFTP_ENDPOINT="$2"; shift 2 ;;
    --sftp-username) SFTP_USERNAME="$2"; shift 2 ;;
    --ssh-key) SSH_KEY_PATH="$2"; shift 2 ;;
    --remote-filename) REMOTE_FILENAME="$2"; shift 2 ;;
    --strict-host-key-checking) STRICT_HOST_KEY_CHECKING="yes"; shift ;;
    --trigger-import-url) TRIGGER_IMPORT_URL="$2"; shift 2 ;;
    --auth-token) AUTH_TOKEN="$2"; shift 2 ;;
    --auth-header) AUTH_HEADER="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[FAIL] Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

# Validate required arguments
if [[ -z "${FILE_PATH}" ]]; then
  echo "[FAIL] Missing required argument: --file" >&2
  usage
  exit 1
fi

if [[ -z "${SFTP_ENDPOINT}" ]]; then
  echo "[FAIL] Missing required argument: --sftp-endpoint" >&2
  echo "" >&2
  echo "Tip: Retrieve endpoint from Terraform outputs:" >&2
  echo "  cd platform/terraform" >&2
  echo "  terraform output -raw sftp_endpoint" >&2
  usage
  exit 1
fi

# Validate file exists
if [[ ! -f "${FILE_PATH}" ]]; then
  echo "[FAIL] File not found: ${FILE_PATH}" >&2
  exit 1
fi

# Validate SSH key exists
if [[ ! -f "${SSH_KEY_PATH}" ]]; then
  echo "[FAIL] SSH private key not found: ${SSH_KEY_PATH}" >&2
  echo "" >&2
  echo "Generate SSH key pair with:" >&2
  echo "  ssh-keygen -t rsa -b 4096 -f ${SSH_KEY_PATH} -N \"\"" >&2
  echo "" >&2
  echo "Then register the public key in Terraform:" >&2
  echo "  export TF_VAR_sftp_user_ssh_public_key=\"\$(cat ${SSH_KEY_PATH}.pub)\"" >&2
  exit 1
fi

# Default remote filename to basename of local file
if [[ -z "${REMOTE_FILENAME}" ]]; then
  REMOTE_FILENAME="$(basename "${FILE_PATH}")"
fi

# Check sftp command exists
if ! command -v sftp >/dev/null 2>&1; then
  echo "[FAIL] sftp command not found. Install OpenSSH client." >&2
  exit 1
fi

# Expand tilde in SSH key path
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"

# Ensure SSH key has correct permissions
chmod 600 "${SSH_KEY_PATH}" 2>/dev/null || true

echo "[INFO] Uploading to AWS Transfer Family SFTP endpoint"
echo "  Local file:      ${FILE_PATH}"
echo "  SFTP endpoint:   ${SFTP_ENDPOINT}"
echo "  SFTP username:   ${SFTP_USERNAME}"
echo "  SSH key:         ${SSH_KEY_PATH}"
echo "  Remote filename: ${REMOTE_FILENAME}"
echo ""

# Upload via SFTP with SSH key authentication
# Files are uploaded to SFTP root (/) which maps to S3 bucket prefix (incoming/)
sftp -i "${SSH_KEY_PATH}" \
     -o StrictHostKeyChecking="${STRICT_HOST_KEY_CHECKING}" \
     -o UserKnownHostsFile=/dev/null \
     -o LogLevel=ERROR \
     "${SFTP_USERNAME}@${SFTP_ENDPOINT}" <<EOF
put "${FILE_PATH}" "${REMOTE_FILENAME}"
bye
EOF

echo "[OK] Uploaded via SFTP: ${SFTP_USERNAME}@${SFTP_ENDPOINT}:/${REMOTE_FILENAME}"
echo "[INFO] File should land in S3 transaction bucket under incoming/ prefix"
echo ""

# Optional: Trigger transaction import API
if [[ -n "${TRIGGER_IMPORT_URL}" ]]; then
  # Determine S3 source path (assuming bucket name from Transfer Family home directory mapping)
  # In practice, the bucket name would need to be retrieved from Terraform outputs
  # For now, construct a generic path that matches the import API contract
  SOURCE_PATH="incoming/${REMOTE_FILENAME}"

  CURL_HEADERS=(-H "Content-Type: application/json")
  if [[ -n "${AUTH_HEADER}" ]]; then
    CURL_HEADERS+=(-H "Authorization: ${AUTH_HEADER}")
  elif [[ -n "${AUTH_TOKEN}" ]]; then
    CURL_HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  echo "[INFO] Triggering import API: ${TRIGGER_IMPORT_URL}"
  response="$(
    curl --silent --show-error --fail \
      --request POST "${TRIGGER_IMPORT_URL}" \
      "${CURL_HEADERS[@]}" \
      --data "{\"sourcePath\":\"${SOURCE_PATH}\"}"
  )"
  echo "[OK] Triggered import API"
  echo "${response}"
fi

echo ""
echo "[SUCCESS] SFTP upload completed successfully"
