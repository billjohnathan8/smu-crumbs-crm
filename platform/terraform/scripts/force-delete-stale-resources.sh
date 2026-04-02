#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"
PROJECT_NAME="${TF_PROJECT_NAME:-scroogebank-crm}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
NAME_PREFIX="${PROJECT_NAME}-${ENVIRONMENT}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required but was not found in PATH."
  exit 1
fi

wait_for_secret_ready() {
  local secret_name="$1"

  for _ in {1..24}; do
    local deleted_date
    deleted_date="$(aws secretsmanager describe-secret \
      --secret-id "${secret_name}" \
      --region "${AWS_REGION}" \
      --query 'DeletedDate' \
      --output text 2>/dev/null || true)"

    if [[ -z "${deleted_date}" || "${deleted_date}" == "None" ]]; then
      return 0
    fi

    sleep 5
  done

  echo "Timed out waiting for secret to leave pending-deletion state: ${secret_name}"
  exit 1
}

wait_for_secret_absent() {
  local secret_name="$1"

  for _ in {1..24}; do
    if ! aws secretsmanager describe-secret --secret-id "${secret_name}" --region "${AWS_REGION}" >/dev/null 2>&1; then
      return 0
    fi

    sleep 5
  done

  echo "Timed out waiting for secret to be deleted: ${secret_name}"
  exit 1
}

force_delete_secret() {
  local secret_name="$1"

  if ! aws secretsmanager describe-secret --secret-id "${secret_name}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "Secret already absent: ${secret_name}"
    return 0
  fi

  local deleted_date
  deleted_date="$(aws secretsmanager describe-secret \
    --secret-id "${secret_name}" \
    --region "${AWS_REGION}" \
    --query 'DeletedDate' \
    --output text 2>/dev/null || true)"

  if [[ -n "${deleted_date}" && "${deleted_date}" != "None" ]]; then
    echo "Restoring secret before force delete: ${secret_name}"
    aws secretsmanager restore-secret --secret-id "${secret_name}" --region "${AWS_REGION}" >/dev/null
    wait_for_secret_ready "${secret_name}"
  fi

  echo "Force deleting secret without recovery window: ${secret_name}"
  aws secretsmanager delete-secret \
    --secret-id "${secret_name}" \
    --region "${AWS_REGION}" \
    --force-delete-without-recovery >/dev/null

  wait_for_secret_absent "${secret_name}"
}

wait_for_log_group_absent() {
  local log_group_name="$1"

  for _ in {1..24}; do
    local count
    count="$(aws logs describe-log-groups \
      --region "${AWS_REGION}" \
      --log-group-name-prefix "${log_group_name}" \
      --query "length(logGroups[?logGroupName == '${log_group_name}'])" \
      --output text)"

    if [[ "${count}" == "0" || "${count}" == "None" ]]; then
      return 0
    fi

    sleep 5
  done

  echo "Timed out waiting for log group to be deleted: ${log_group_name}"
  exit 1
}

delete_log_group_if_present() {
  local log_group_name="$1"
  local count

  count="$(aws logs describe-log-groups \
    --region "${AWS_REGION}" \
    --log-group-name-prefix "${log_group_name}" \
    --query "length(logGroups[?logGroupName == '${log_group_name}'])" \
    --output text)"

  if [[ "${count}" == "0" || "${count}" == "None" ]]; then
    echo "Log group already absent: ${log_group_name}"
    return 0
  fi

  echo "Deleting log group: ${log_group_name}"
  aws logs delete-log-group --log-group-name "${log_group_name}" --region "${AWS_REGION}"
  wait_for_log_group_absent "${log_group_name}"
}

force_delete_secret "/${PROJECT_NAME}/${ENVIRONMENT}/jwt/hmac_secret"
force_delete_secret "/${PROJECT_NAME}/${ENVIRONMENT}/user/root_admin_password"
force_delete_secret "/${PROJECT_NAME}/${ENVIRONMENT}/db/username"
force_delete_secret "/${PROJECT_NAME}/${ENVIRONMENT}/db/password"
delete_log_group_if_present "/aws/vpc/${NAME_PREFIX}-flow-logs"

echo "Stale secrets and VPC flow log group cleanup complete. Rerun the Terraform plan workflow now."