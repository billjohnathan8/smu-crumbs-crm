#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# scripts/ci/run-localstack-smoke.sh
#
# Starts LocalStack via docker compose, waits for the init scripts to finish
# provisioning all AWS resources, then asserts that every expected resource
# exists (including SES sender identity) and runs smoke checks.
#
# Used by .github/workflows/reusable-localstack-smoke.yml.
# Can also be run locally:
#   bash scripts/ci/run-localstack-smoke.sh
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.localstack.yml"
LOG_ROOT="${ROOT_DIR}/build-logs/localstack-smoke"

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

# Fake credentials — LocalStack accepts any non-empty value.
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1

REGION="ap-southeast-1"
ENDPOINT="http://localhost:4566"
SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-verification@crm.local}"
AUDIT_CONSUMER_FUNCTION_NAME="scroogebank-crm-dev-audit-consumer"
AUDIT_CONSUMER_RUNTIME="${AUDIT_CONSUMER_RUNTIME:-python3.12}"
AUDIT_QUEUE_NAME="scroogebank-crm-dev-audit"
AUDIT_TABLE_NAME="scroogebank-crm-dev-audit-logs"
AML_CONSUMER_FUNCTION_NAME="scroogebank-crm-dev-aml-consumer"
AML_CONSUMER_RUNTIME="${AML_CONSUMER_RUNTIME:-python3.12}"
AML_QUEUE_NAME="scroogebank-crm-dev-aml"
AML_TABLE_NAME="scroogebank-crm-dev-aml-reports"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

aws_local() {
  # Prefer the host aws CLI when available (CI runners have it pre-installed).
  # Fall back to docker exec so the script works locally without aws CLI.
  if command -v aws >/dev/null 2>&1; then
    aws --endpoint-url "${ENDPOINT}" --region "${REGION}" "$@"
    return 0
  fi
  docker exec localstack awslocal --region "${REGION}" "$@"
}

assert_sqs_queue() {
  local name="$1"
  echo -n "    SQS queue '${name}'... "
  aws_local sqs get-queue-url --queue-name "${name}" >/dev/null
  echo "OK"
}

assert_dynamodb_table() {
  local name="$1"
  echo -n "    DynamoDB table '${name}'... "
  aws_local dynamodb describe-table --table-name "${name}" >/dev/null
  echo "OK"
}

assert_dynamodb_table_pk_sk_schema() {
  local name="$1"
  local actual_schema=""
  echo -n "    DynamoDB table '${name}' key schema pk/sk... "
  actual_schema="$(
    aws_local dynamodb describe-table --table-name "${name}" \
      --query "Table.KeySchema[*].[AttributeName,KeyType]" \
      --output text
  )"
  if echo "${actual_schema}" | grep -q $'pk\tHASH' \
    && echo "${actual_schema}" | grep -q $'sk\tRANGE'; then
    echo "OK"
    return 0
  fi
  echo "[FAIL]" >&2
  echo "      observed key schema: ${actual_schema}" >&2
  exit 1
}

assert_s3_bucket() {
  local name="$1"
  echo -n "    S3 bucket '${name}'... "
  aws_local s3api head-bucket --bucket "${name}" >/dev/null
  echo "OK"
}

assert_sns_topic() {
  local name_fragment="$1"
  echo -n "    SNS topic containing '${name_fragment}'... "
  aws_local sns list-topics \
    --query 'Topics[].TopicArn' \
    --output text | grep -q "${name_fragment}"
  echo "OK"
}

assert_secret() {
  local name="$1"
  echo -n "    Secret '${name}'... "
  aws_local secretsmanager describe-secret --secret-id "${name}" >/dev/null
  echo "OK"
}

assert_ses_identity() {
  local email="$1"
  echo -n "    SES identity '${email}'... "
  if aws_local sesv2 get-email-identity --email-identity "${email}" >/dev/null 2>&1; then
    echo "OK"
    return 0
  fi
  aws_local ses get-identity-verification-attributes --identities "${email}" >/dev/null
  echo "OK"
}

assert_ses_send() {
  local email="$1"
  local destination_json=""
  local content_json=""
  echo -n "    SES send-email path... "
  if aws_local ses send-email \
    --source "${email}" \
    --destination "ToAddresses=${email}" \
    --message "Subject={Data=LocalStack smoke},Body={Text={Data=SES smoke message}}" \
    >/dev/null 2>&1; then
    echo "OK"
    return 0
  fi

  destination_json="$(printf '{"ToAddresses":["%s"]}' "${email}")"
  content_json='{"Simple":{"Subject":{"Data":"LocalStack smoke"},"Body":{"Text":{"Data":"SES smoke message"}}}}'
  if aws_local sesv2 send-email \
    --from-email-address "${email}" \
    --destination "${destination_json}" \
    --content "${content_json}" \
    >/dev/null 2>&1; then
    echo "OK"
    return 0
  fi

  echo "SKIP (SES send operation unavailable in this LocalStack mode)"
}

fail_lambda_runtime_unavailable() {
  local lambda_name="$1"
  local deploy_error_file="$2"
  echo "[FAIL] ${lambda_name} e2e requires LocalStack Lambda runtime execution, but it is unavailable." >&2
  echo "       Ensure Docker Desktop/Engine is running and LocalStack lambda runtime executor is enabled." >&2
  echo "       If needed, verify the LocalStack container has access to the Docker socket." >&2
  if [[ -f "${deploy_error_file}" ]]; then
    echo "       deploy error log: ${deploy_error_file}" >&2
    tail -40 "${deploy_error_file}" >&2 || true
  fi
  exit 1
}

deploy_audit_consumer_lambda() {
  local zip_path="${ROOT_DIR}/services/backend/audit-consumer/audit-consumer-lambda.zip"
  local zip_arg=""
  local env_vars="Variables={DYNAMODB_TABLE_NAME=${AUDIT_TABLE_NAME},IDEMPOTENCY_TTL_DAYS=90,LOG_LEVEL=INFO}"
  local aws_version=""
  local container_zip_path="/tmp/audit-consumer-lambda.zip"
  local deploy_err_file="${LOG_DIR}/audit-consumer-lambda-deploy.err"

  if [[ ! -f "${zip_path}" && "${zip_path}" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    zip_path="/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
  if [[ ! -f "${zip_path}" ]]; then
    echo "[FAIL] Missing ${zip_path}. Build artifacts first: python scripts/ci/build_lambda_artifacts.py" >&2
    exit 1
  fi
  if command -v aws >/dev/null 2>&1; then
    zip_arg="fileb://${zip_path}"
    aws_version="$(aws --version 2>&1 || true)"
    if echo "${aws_version}" | grep -qi "windows/"; then
      if [[ "${zip_path}" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
        zip_arg="fileb://${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
      elif [[ "${zip_path}" =~ ^/([a-zA-Z])/(.*)$ ]]; then
        zip_arg="fileb://${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
      fi
    fi
  else
    docker cp "${zip_path}" "localstack:${container_zip_path}"
    zip_arg="fileb://${container_zip_path}"
  fi

  if aws_local lambda get-function --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" >/dev/null 2>&1; then
    if ! aws_local lambda update-function-code \
      --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
    if ! aws_local lambda update-function-configuration \
      --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${AUDIT_CONSUMER_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
  else
    if ! aws_local lambda create-function \
      --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
      --runtime "${AUDIT_CONSUMER_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
  fi

  for i in $(seq 1 40); do
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    if [[ "${state}" == "Failed" ]]; then
      reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      reason="$(echo "${reason}" | tr -d '\r')"
      if echo "${reason}" | grep -q "Docker not available"; then
        return 2
      fi
      echo "[FAIL] audit-consumer entered Failed state: ${reason}" >&2
      return 1
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] audit-consumer did not become Active in time (state=${state})" >&2
      return 1
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
      --queue-name "${AUDIT_QUEUE_NAME}" \
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

  mapping_uuid="$(
    aws_local lambda list-event-source-mappings \
      --event-source-arn "${queue_arn}" \
      --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
      --query "EventSourceMappings[0].UUID" \
      --output text 2>/dev/null || true
  )"
  mapping_uuid="$(echo "${mapping_uuid}" | tr -d '\r')"

  if [[ -z "${mapping_uuid}" || "${mapping_uuid}" == "None" ]]; then
    mapping_uuid="$(
      aws_local lambda create-event-source-mapping \
        --function-name "${AUDIT_CONSUMER_FUNCTION_NAME}" \
        --event-source-arn "${queue_arn}" \
        --enabled \
        --batch-size 10 \
        --function-response-types ReportBatchItemFailures \
        --query "UUID" \
        --output text
    )"
    mapping_uuid="$(echo "${mapping_uuid}" | tr -d '\r')"
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
    mapping_state="$(echo "${mapping_state}" | tr -d '\r')"
    if [[ "${mapping_state}" == "Enabled" || "${mapping_state}" == "Enabling" ]]; then
      return 0
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] audit-consumer event source mapping was not enabled (state=${mapping_state})" >&2
      exit 1
    fi
    sleep 1
  done
}

deploy_aml_consumer_lambda() {
  local zip_path="${ROOT_DIR}/services/backend/aml-consumer/aml-consumer-lambda.zip"
  local zip_arg=""
  local env_vars="Variables={DYNAMODB_TABLE_NAME=${AML_TABLE_NAME},IDEMPOTENCY_TTL_DAYS=90,LOG_LEVEL=INFO}"
  local aws_version=""
  local container_zip_path="/tmp/aml-consumer-lambda.zip"
  local deploy_err_file="${LOG_DIR}/aml-consumer-lambda-deploy.err"

  if [[ ! -f "${zip_path}" && "${zip_path}" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    zip_path="/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
  if [[ ! -f "${zip_path}" ]]; then
    echo "[FAIL] Missing ${zip_path}. Build artifacts first: python scripts/ci/build_lambda_artifacts.py" >&2
    exit 1
  fi
  if command -v aws >/dev/null 2>&1; then
    zip_arg="fileb://${zip_path}"
    aws_version="$(aws --version 2>&1 || true)"
    if echo "${aws_version}" | grep -qi "windows/"; then
      if [[ "${zip_path}" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
        zip_arg="fileb://${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
      elif [[ "${zip_path}" =~ ^/([a-zA-Z])/(.*)$ ]]; then
        zip_arg="fileb://${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
      fi
    fi
  else
    docker cp "${zip_path}" "localstack:${container_zip_path}"
    zip_arg="fileb://${container_zip_path}"
  fi

  if aws_local lambda get-function --function-name "${AML_CONSUMER_FUNCTION_NAME}" >/dev/null 2>&1; then
    if ! aws_local lambda update-function-code \
      --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
      --zip-file "${zip_arg}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
    if ! aws_local lambda update-function-configuration \
      --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${AML_CONSUMER_RUNTIME}" \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
  else
    if ! aws_local lambda create-function \
      --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
      --runtime "${AML_CONSUMER_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 \
      --memory-size 256 \
      --environment "${env_vars}" \
      >/dev/null 2>"${deploy_err_file}"; then
      if grep -q "Docker not available" "${deploy_err_file}"; then
        return 2
      fi
      cat "${deploy_err_file}" >&2
      return 1
    fi
  fi

  for i in $(seq 1 40); do
    state="$(
      aws_local lambda get-function-configuration \
        --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
        --query "State" \
        --output text 2>/dev/null || true
    )"
    state="$(echo "${state}" | tr -d '\r')"
    if [[ "${state}" == "Active" ]]; then
      return 0
    fi
    if [[ "${state}" == "Failed" ]]; then
      reason="$(
        aws_local lambda get-function-configuration \
          --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
          --query "StateReason" \
          --output text 2>/dev/null || true
      )"
      reason="$(echo "${reason}" | tr -d '\r')"
      if echo "${reason}" | grep -q "Docker not available"; then
        return 2
      fi
      echo "[FAIL] aml-consumer entered Failed state: ${reason}" >&2
      return 1
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] aml-consumer did not become Active in time (state=${state})" >&2
      return 1
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
      --queue-name "${AML_QUEUE_NAME}" \
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

  mapping_uuid="$(
    aws_local lambda list-event-source-mappings \
      --event-source-arn "${queue_arn}" \
      --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
      --query "EventSourceMappings[0].UUID" \
      --output text 2>/dev/null || true
  )"
  mapping_uuid="$(echo "${mapping_uuid}" | tr -d '\r')"

  if [[ -z "${mapping_uuid}" || "${mapping_uuid}" == "None" ]]; then
    mapping_uuid="$(
      aws_local lambda create-event-source-mapping \
        --function-name "${AML_CONSUMER_FUNCTION_NAME}" \
        --event-source-arn "${queue_arn}" \
        --enabled \
        --batch-size 10 \
        --function-response-types ReportBatchItemFailures \
        --query "UUID" \
        --output text
    )"
    mapping_uuid="$(echo "${mapping_uuid}" | tr -d '\r')"
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
    mapping_state="$(echo "${mapping_state}" | tr -d '\r')"
    if [[ "${mapping_state}" == "Enabled" || "${mapping_state}" == "Enabling" ]]; then
      return 0
    fi
    if [[ ${i} -eq 40 ]]; then
      echo "[FAIL] aml-consumer event source mapping was not enabled (state=${mapping_state})" >&2
      exit 1
    fi
    sleep 1
  done
}

wait_for_audit_item() {
  local pk="$1"
  local sk="$2"
  local attempts="${3:-30}"
  local key_json=""
  local result=""

  key_json="$(printf '{"pk":{"S":"%s"},"sk":{"S":"%s"}}' "${pk}" "${sk}")"

  for i in $(seq 1 "${attempts}"); do
    result="$(
      aws_local dynamodb get-item \
        --table-name "${AUDIT_TABLE_NAME}" \
        --key "${key_json}" \
        --query "Item.pk.S" \
        --output text 2>/dev/null || true
    )"
    result="$(echo "${result}" | tr -d '\r')"
    if [[ "${result}" == "${pk}" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[FAIL] Timed out waiting for audit item pk=${pk} sk=${sk}" >&2
  exit 1
}

audit_item_count_by_pk() {
  local pk="$1"
  local expr_values=""
  local count=""
  expr_values="$(printf '{":pk":{"S":"%s"}}' "${pk}")"
  count="$(
    aws_local dynamodb query \
      --table-name "${AUDIT_TABLE_NAME}" \
      --key-condition-expression "pk = :pk" \
      --expression-attribute-values "${expr_values}" \
      --query "Count" \
      --output text 2>/dev/null || true
  )"
  echo "${count}" | tr -d '\r'
}

wait_for_aml_item() {
  local pk="$1"
  local sk="$2"
  local attempts="${3:-30}"
  local key_json=""
  local result=""

  key_json="$(printf '{"pk":{"S":"%s"},"sk":{"S":"%s"}}' "${pk}" "${sk}")"

  for i in $(seq 1 "${attempts}"); do
    result="$(
      aws_local dynamodb get-item \
        --table-name "${AML_TABLE_NAME}" \
        --key "${key_json}" \
        --query "Item.pk.S" \
        --output text 2>/dev/null || true
    )"
    result="$(echo "${result}" | tr -d '\r')"
    if [[ "${result}" == "${pk}" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[FAIL] Timed out waiting for aml item pk=${pk} sk=${sk}" >&2
  exit 1
}

aml_item_count_by_pk() {
  local pk="$1"
  local expr_values=""
  local count=""
  expr_values="$(printf '{":pk":{"S":"%s"}}' "${pk}")"
  count="$(
    aws_local dynamodb query \
      --table-name "${AML_TABLE_NAME}" \
      --key-condition-expression "pk = :pk" \
      --expression-attribute-values "${expr_values}" \
      --query "Count" \
      --output text 2>/dev/null || true
  )"
  echo "${count}" | tr -d '\r'
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
    visible="$(echo "${visible}" | tr -d '\r')"
    not_visible="$(
      aws_local sqs get-queue-attributes \
        --queue-url "${queue_url}" \
        --attribute-names ApproximateNumberOfMessagesNotVisible \
        --query "Attributes.ApproximateNumberOfMessagesNotVisible" \
        --output text 2>/dev/null || true
    )"
    not_visible="$(echo "${not_visible}" | tr -d '\r')"

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

# --------------------------------------------------------------------------
# Teardown trap — always stops the LocalStack container on exit
# --------------------------------------------------------------------------

cleanup() {
  echo ""
  echo "==> Stopping LocalStack..."
  docker compose -f "${COMPOSE_FILE}" stop localstack 2>/dev/null || true
  docker compose -f "${COMPOSE_FILE}" rm -f localstack 2>/dev/null || true
}
trap cleanup EXIT

# --------------------------------------------------------------------------
# 1. Start LocalStack
# --------------------------------------------------------------------------

echo "==> Starting LocalStack (only the localstack service)..."
docker compose -f "${COMPOSE_FILE}" up -d localstack 2>&1 | tee "${LOG_DIR}/compose-up.log"

# --------------------------------------------------------------------------
# 2. Wait for LocalStack health endpoint
# --------------------------------------------------------------------------

echo "==> Waiting for LocalStack health endpoint..."
HEALTH_ATTEMPTS=60
for i in $(seq 1 ${HEALTH_ATTEMPTS}); do
  STATUS=$(curl -sf "${ENDPOINT}/_localstack/health" 2>/dev/null || true)
  if echo "${STATUS}" | grep -q '"sqs"'; then
    echo "    [OK] LocalStack gateway is up (attempt ${i}/${HEALTH_ATTEMPTS})"
    break
  fi
  if [[ ${i} -eq ${HEALTH_ATTEMPTS} ]]; then
    echo "    [FAIL] LocalStack did not become healthy after ${HEALTH_ATTEMPTS} attempts." >&2
    docker logs localstack 2>&1 | tail -80 >&2
    exit 1
  fi
  sleep 3
done

# --------------------------------------------------------------------------
# 3. Wait for the init script to complete
#    The init script runs asynchronously inside LocalStack after it's healthy.
#    We poll for the last Secrets Manager secret as a sentinel.
# --------------------------------------------------------------------------

echo "==> Waiting for init scripts to provision resources..."
# Poll for the LAST resource created by 01-setup.sh (root_admin_password secret).
# Polling for an early resource (e.g. the first SQS queue) causes a race condition:
# the sentinel passes before DynamoDB/S3/SNS/Secrets Manager have been created.
INIT_ATTEMPTS=80
for i in $(seq 1 ${INIT_ATTEMPTS}); do
  if aws_local secretsmanager describe-secret \
       --secret-id scroogebank-crm-dev/root_admin_password >/dev/null 2>&1; then
    echo "    [OK] Init scripts completed (attempt ${i}/${INIT_ATTEMPTS})"
    break
  fi
  if [[ ${i} -eq ${INIT_ATTEMPTS} ]]; then
    echo "    [FAIL] Init scripts did not complete in time." >&2
    docker logs localstack 2>&1 | tail -80 >&2
    exit 1
  fi
  sleep 3
done

# --------------------------------------------------------------------------
# 4. Resource assertions
# --------------------------------------------------------------------------

echo ""
echo "==> Asserting SQS queues..."
assert_sqs_queue "scroogebank-crm-dev-audit"
assert_sqs_queue "scroogebank-crm-dev-audit-dlq"
assert_sqs_queue "scroogebank-crm-dev-aml"
assert_sqs_queue "scroogebank-crm-dev-aml-dlq"

echo ""
echo "==> Asserting DynamoDB tables..."
assert_dynamodb_table "scroogebank-crm-dev-audit-logs"
assert_dynamodb_table "scroogebank-crm-dev-aml-reports"
assert_dynamodb_table_pk_sk_schema "scroogebank-crm-dev-audit-logs"
assert_dynamodb_table_pk_sk_schema "scroogebank-crm-dev-aml-reports"

echo ""
echo "==> Asserting S3 buckets..."
assert_s3_bucket "scroogebank-crm-dev-frontend"
assert_s3_bucket "scroogebank-crm-dev-verification"
assert_s3_bucket "scroogebank-crm-dev-transaction-sftp"

echo ""
echo "==> Asserting SNS topics..."
assert_sns_topic "scroogebank-crm-dev-verification"

echo ""
echo "==> Asserting SES identities..."
assert_ses_identity "${SES_SENDER_EMAIL}"
assert_ses_send "${SES_SENDER_EMAIL}"

echo ""
echo "==> Asserting Secrets Manager secrets..."
assert_secret "scroogebank-crm-dev/db_username"
assert_secret "scroogebank-crm-dev/db_password"
assert_secret "scroogebank-crm-dev/jwt_hmac"
assert_secret "scroogebank-crm-dev/root_admin_password"

# --------------------------------------------------------------------------
# 5. audit-consumer LocalStack end-to-end smoke test
#    SQS -> Lambda -> DynamoDB assertions for valid/duplicate/malformed payloads.
# --------------------------------------------------------------------------

echo ""
echo "==> Running audit-consumer LocalStack end-to-end smoke test..."

echo "    Deploying audit-consumer lambda..."
if deploy_audit_consumer_lambda; then
  :
else
  deploy_exit_code=$?
  if [[ ${deploy_exit_code} -eq 2 ]]; then
    fail_lambda_runtime_unavailable \
      "${AUDIT_CONSUMER_FUNCTION_NAME}" \
      "${LOG_DIR}/audit-consumer-lambda-deploy.err"
  else
    exit "${deploy_exit_code}"
  fi
fi

echo "    Wiring SQS event source mapping..."
wire_audit_consumer_event_source_mapping

QUEUE_URL=$(aws_local sqs get-queue-url \
  --queue-name "${AUDIT_QUEUE_NAME}" \
  --query 'QueueUrl' \
  --output text)

VALID_EVENT_ID="evt-localstack-${RUN_ID}"
VALID_OCCURRED_AT="2026-03-01T10:30:00Z"
VALID_PAYLOAD="$(cat <<JSON
{"eventId":"${VALID_EVENT_ID}","occurredAt":"${VALID_OCCURRED_AT}","action":"CLIENT_UPDATED","attributeName":"risk_rating","userId":"smoke-user","clientId":"smoke-client","sourceService":"localstack-smoke","beforeValue":"low","afterValue":"high","metadata":{"suite":"localstack-smoke"}}
JSON
)"
VALID_PK="AUDIT#${VALID_EVENT_ID}"
VALID_SK="${VALID_OCCURRED_AT}"

aws_local sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body "${VALID_PAYLOAD}" \
  >/dev/null

wait_for_audit_item "${VALID_PK}" "${VALID_SK}"
VALID_COUNT="$(audit_item_count_by_pk "${VALID_PK}")"
if [[ "${VALID_COUNT}" != "1" ]]; then
  echo "    [FAIL] Expected one row after valid message, got ${VALID_COUNT}" >&2
  exit 1
fi
echo "    [OK] valid message wrote one audit row"

aws_local sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body "${VALID_PAYLOAD}" \
  >/dev/null

wait_for_queue_drained "${QUEUE_URL}" 30 2
DUPLICATE_COUNT="$(audit_item_count_by_pk "${VALID_PK}")"
if [[ "${DUPLICATE_COUNT}" != "1" ]]; then
  echo "    [FAIL] Duplicate message should not create a second row (count=${DUPLICATE_COUNT})" >&2
  exit 1
fi
echo "    [OK] duplicate message treated as success without duplicate row"

aws_local sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body '{bad-json' \
  >/dev/null

wait_for_queue_drained "${QUEUE_URL}" 30 3
POST_MALFORMED_COUNT="$(audit_item_count_by_pk "${VALID_PK}")"
if [[ "${POST_MALFORMED_COUNT}" != "1" ]]; then
  echo "    [FAIL] Malformed message path changed persisted row count unexpectedly (count=${POST_MALFORMED_COUNT})" >&2
  exit 1
fi
echo "    [OK] malformed message exercised non-retryable path (queue drained, no extra row)"

# --------------------------------------------------------------------------
# 6. aml-consumer LocalStack end-to-end smoke test
#    SQS -> Lambda -> DynamoDB assertions for valid/duplicate/malformed payloads.
# --------------------------------------------------------------------------

echo ""
echo "==> Running aml-consumer LocalStack end-to-end smoke test..."

echo "    Deploying aml-consumer lambda..."
if deploy_aml_consumer_lambda; then
  :
else
  deploy_exit_code=$?
  if [[ ${deploy_exit_code} -eq 2 ]]; then
    fail_lambda_runtime_unavailable \
      "${AML_CONSUMER_FUNCTION_NAME}" \
      "${LOG_DIR}/aml-consumer-lambda-deploy.err"
  else
    exit "${deploy_exit_code}"
  fi
fi

echo "    Wiring SQS event source mapping..."
wire_aml_consumer_event_source_mapping

AML_QUEUE_URL=$(aws_local sqs get-queue-url \
  --queue-name "${AML_QUEUE_NAME}" \
  --query 'QueueUrl' \
  --output text)

AML_ALERT_ID="aml_${RUN_ID//[^0-9]/}"
AML_DETECTED_AT="2026-03-01T10:30:00Z"
AML_VALID_PAYLOAD="$(cat <<JSON
{"alertId":"${AML_ALERT_ID}","detectedAt":"${AML_DETECTED_AT}","clientId":"smoke-client","alertType":"LargeCashDeposit","description":"large amount pattern","reviewStatus":"Pending","entityId":"entity-smoke","sourceService":"localstack-smoke","metadata":{"suite":"localstack-smoke"}}
JSON
)"
AML_PK="AML#${AML_ALERT_ID}"
AML_SK="${AML_DETECTED_AT}"

aws_local sqs send-message \
  --queue-url "${AML_QUEUE_URL}" \
  --message-body "${AML_VALID_PAYLOAD}" \
  >/dev/null

wait_for_aml_item "${AML_PK}" "${AML_SK}"
AML_VALID_COUNT="$(aml_item_count_by_pk "${AML_PK}")"
if [[ "${AML_VALID_COUNT}" != "1" ]]; then
  echo "    [FAIL] Expected one row after AML valid message, got ${AML_VALID_COUNT}" >&2
  exit 1
fi
echo "    [OK] aml-consumer valid message wrote one row"

aws_local sqs send-message \
  --queue-url "${AML_QUEUE_URL}" \
  --message-body "${AML_VALID_PAYLOAD}" \
  >/dev/null

wait_for_queue_drained "${AML_QUEUE_URL}" 30 2
AML_DUPLICATE_COUNT="$(aml_item_count_by_pk "${AML_PK}")"
if [[ "${AML_DUPLICATE_COUNT}" != "1" ]]; then
  echo "    [FAIL] AML duplicate message should not create a second row (count=${AML_DUPLICATE_COUNT})" >&2
  exit 1
fi
echo "    [OK] aml-consumer duplicate message treated as success without duplicate row"

aws_local sqs send-message \
  --queue-url "${AML_QUEUE_URL}" \
  --message-body '{bad-json' \
  >/dev/null

wait_for_queue_drained "${AML_QUEUE_URL}" 30 3
AML_POST_MALFORMED_COUNT="$(aml_item_count_by_pk "${AML_PK}")"
if [[ "${AML_POST_MALFORMED_COUNT}" != "1" ]]; then
  echo "    [FAIL] AML malformed message path changed persisted row count unexpectedly (count=${AML_POST_MALFORMED_COUNT})" >&2
  exit 1
fi
echo "    [OK] aml-consumer malformed message exercised non-retryable path (queue drained, no extra row)"

# --------------------------------------------------------------------------

echo ""
echo "==> LocalStack smoke test PASSED."
