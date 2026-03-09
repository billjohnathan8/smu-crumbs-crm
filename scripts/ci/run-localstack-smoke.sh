#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# scripts/ci/run-localstack-smoke.sh
#
# Starts LocalStack via docker compose, waits for the init scripts to finish
# provisioning all AWS resources, then asserts that every expected resource
# exists and runs a basic SQS round-trip to confirm the service is functional.
#
# Used by .github/workflows/reusable-localstack-smoke.yml.
# Can also be run locally:
#   bash scripts/ci/run-localstack-smoke.sh
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.localstack.yml"
LOG_DIR="${ROOT_DIR}/build-logs/localstack-smoke"

mkdir -p "${LOG_DIR}"

# Fake credentials — LocalStack accepts any non-empty value.
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1

REGION="ap-southeast-1"
ENDPOINT="http://localhost:4566"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

aws_local() {
  aws --endpoint-url "${ENDPOINT}" --region "${REGION}" "$@"
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
#    We poll for the first SQS queue as a sentinel.
# --------------------------------------------------------------------------

echo "==> Waiting for init scripts to provision resources..."
INIT_ATTEMPTS=80
for i in $(seq 1 ${INIT_ATTEMPTS}); do
  if aws_local sqs get-queue-url \
       --queue-name scroogebank-crm-dev-audit >/dev/null 2>&1; then
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

echo ""
echo "==> Asserting S3 buckets..."
assert_s3_bucket "scroogebank-crm-dev-frontend"
assert_s3_bucket "scroogebank-crm-dev-verification"

echo ""
echo "==> Asserting SNS topics..."
assert_sns_topic "scroogebank-crm-dev-verification"

echo ""
echo "==> Asserting Secrets Manager secrets..."
assert_secret "scroogebank-crm-dev/db_username"
assert_secret "scroogebank-crm-dev/db_password"
assert_secret "scroogebank-crm-dev/jwt_hmac"
assert_secret "scroogebank-crm-dev/root_admin_password"

# --------------------------------------------------------------------------
# 5. SQS round-trip smoke test
#    Sends one message to the audit queue and receives it back.
# --------------------------------------------------------------------------

echo ""
echo "==> Running SQS round-trip smoke test..."

QUEUE_URL=$(aws_local sqs get-queue-url \
  --queue-name scroogebank-crm-dev-audit \
  --query 'QueueUrl' \
  --output text)

MSG_ID=$(aws_local sqs send-message \
  --queue-url "${QUEUE_URL}" \
  --message-body '{"eventType":"CI_SMOKE","userId":"smoke-test","timestamp":"2026-01-01T00:00:00Z"}' \
  --query 'MessageId' \
  --output text)

echo "    Sent message ID: ${MSG_ID}"

RECV_ATTEMPTS=10
for i in $(seq 1 ${RECV_ATTEMPTS}); do
  BODY=$(aws_local sqs receive-message \
    --queue-url "${QUEUE_URL}" \
    --wait-time-seconds 2 \
    --query 'Messages[0].Body' \
    --output text 2>/dev/null || true)

  if echo "${BODY}" | grep -q "CI_SMOKE"; then
    echo "    Round-trip OK — received message body contains expected marker."
    break
  fi

  if [[ ${i} -eq ${RECV_ATTEMPTS} ]]; then
    echo "    [FAIL] Could not receive SQS message after ${RECV_ATTEMPTS} attempts." >&2
    exit 1
  fi
  sleep 2
done

# --------------------------------------------------------------------------

echo ""
echo "==> LocalStack smoke test PASSED."
