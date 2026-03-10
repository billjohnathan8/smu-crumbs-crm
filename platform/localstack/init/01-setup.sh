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
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

awslocal dynamodb create-table \
  --table-name scroogebank-crm-dev-aml-reports \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

# --------------------------------------------------------------------------
# S3 buckets
# --------------------------------------------------------------------------
echo "==> Creating S3 buckets..."

awslocal s3 mb s3://scroogebank-crm-dev-frontend  --region "${REGION}"
awslocal s3 mb s3://scroogebank-crm-dev-verification --region "${REGION}"

# --------------------------------------------------------------------------
# SNS topics
# --------------------------------------------------------------------------
echo "==> Creating SNS topics..."

awslocal sns create-topic \
  --name scroogebank-crm-dev-verification \
  --region "${REGION}"

# --------------------------------------------------------------------------
# Secrets Manager — seed dev secrets
# --------------------------------------------------------------------------
echo "==> Seeding Secrets Manager..."

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/db_username \
  --secret-string "crm_app" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/db_password \
  --secret-string "devpassword" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/jwt_hmac \
  --secret-string "dev-jwt-secret-do-not-use-in-prod" \
  --region "${REGION}"

awslocal secretsmanager create-secret \
  --name scroogebank-crm-dev/root_admin_password \
  --secret-string "devadminpassword" \
  --region "${REGION}"

# --------------------------------------------------------------------------
echo "==> [LocalStack init] Bootstrap complete."
