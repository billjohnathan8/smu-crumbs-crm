#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# platform/localstack/init/01-setup.sh
#
# Auto-provisioning script executed by LocalStack once it is healthy.
# LocalStack runs every script in /etc/localstack/init/ready.d/ on startup.
#
# Creates all AWS resources needed for the ScroogeBank CRM event-driven
# pipeline:  SQS → Lambda → DynamoDB → S3 → SNS/SES
# -----------------------------------------------------------------------------
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"
SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-verification@crm.local}"

echo "==> [LocalStack init] Starting resource provisioning (region: ${REGION})..."

# --------------------------------------------------------------------------
# SQS queues
# --------------------------------------------------------------------------
echo "==> Creating SQS queues..."

awslocal sqs create-queue \
  --queue-name scroogebank-crm-dev-audit \
  --region "${REGION}"

awslocal sqs create-queue \
  --queue-name scroogebank-crm-dev-audit-dlq \
  --region "${REGION}"

awslocal sqs create-queue \
  --queue-name scroogebank-crm-dev-aml \
  --region "${REGION}"

awslocal sqs create-queue \
  --queue-name scroogebank-crm-dev-aml-dlq \
  --region "${REGION}"

# --------------------------------------------------------------------------
# DynamoDB tables
# --------------------------------------------------------------------------
echo "==> Creating DynamoDB tables..."

awslocal dynamodb create-table \
  --table-name scroogebank-crm-dev-audit-logs \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

awslocal dynamodb create-table \
  --table-name scroogebank-crm-dev-aml-reports \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

# --------------------------------------------------------------------------
# S3 buckets
# --------------------------------------------------------------------------
echo "==> Creating S3 buckets..."

awslocal s3 mb s3://scroogebank-crm-dev-frontend  --region "${REGION}"
awslocal s3 mb s3://scroogebank-crm-dev-verification --region "${REGION}"
awslocal s3 mb s3://scroogebank-crm-dev-transaction-sftp --region "${REGION}"

# --------------------------------------------------------------------------
# SNS topics
# --------------------------------------------------------------------------
echo "==> Creating SNS topics..."

awslocal sns create-topic \
  --name scroogebank-crm-dev-verification \
  --region "${REGION}"

# --------------------------------------------------------------------------
# SES sender identity (used by client-service verification email path)
# --------------------------------------------------------------------------
echo "==> Creating SES sender identity..."
if awslocal sesv2 get-email-identity \
  --email-identity "${SES_SENDER_EMAIL}" \
  --region "${REGION}" >/dev/null 2>&1; then
  echo "    SES identity already exists: ${SES_SENDER_EMAIL}"
elif awslocal sesv2 create-email-identity \
  --email-identity "${SES_SENDER_EMAIL}" \
  --region "${REGION}" >/dev/null 2>&1; then
  echo "    SESv2 identity created: ${SES_SENDER_EMAIL}"
elif awslocal ses verify-email-identity \
  --email-address "${SES_SENDER_EMAIL}" \
  --region "${REGION}" >/dev/null 2>&1; then
  echo "    SES identity verified (v1 API): ${SES_SENDER_EMAIL}"
else
  echo "[FAIL] Unable to create SES sender identity in LocalStack: ${SES_SENDER_EMAIL}" >&2
  exit 1
fi

# --------------------------------------------------------------------------
# Secrets Manager — seed dev secrets (values from LocalStack container env)
# --------------------------------------------------------------------------
echo "==> Seeding Secrets Manager..."

if [[ -z "${LOCAL_DB_PASSWORD:-}" || -z "${JWT_HMAC_SECRET:-}" || -z "${E2E_ADMIN_PASSWORD:-}" ]]; then
  echo "[FAIL] LOCAL_DB_PASSWORD, JWT_HMAC_SECRET, and E2E_ADMIN_PASSWORD must be set in the environment when starting LocalStack (see repo root .env.local)." >&2
  exit 1
fi

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/db_username \
  --secret-string "crm_app" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/db_password \
  --secret-string "${LOCAL_DB_PASSWORD}" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/jwt_hmac \
  --secret-string "${JWT_HMAC_SECRET}" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/root_admin_password \
  --secret-string "${E2E_ADMIN_PASSWORD}" \
  --region "${REGION}"

# --------------------------------------------------------------------------
echo "==> [LocalStack init] Bootstrap complete."
