#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-prod}"
PROJECT_NAME="${TF_PROJECT_NAME:-scroogebank-crm}"
VAR_FILE="env/${ENVIRONMENT}.tfvars"
RUNTIME_VAR_FILE="${2:-runtime.auto.tfvars}"

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform is required but was not found in PATH."
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required but was not found in PATH."
  exit 1
fi

if [[ ! -f "${VAR_FILE}" ]]; then
  echo "Missing var-file: ${VAR_FILE}"
  exit 1
fi

tf_args=("-input=false" "-var-file=${VAR_FILE}")
if [[ -f "${RUNTIME_VAR_FILE}" ]]; then
  tf_args+=("-var-file=${RUNTIME_VAR_FILE}")
fi

get_tfvar_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      value = $2
      sub(/#.*/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "${VAR_FILE}"
}

state_has() {
  local address="$1"
  terraform state list 2>/dev/null | grep -Fxq "${address}"
}

import_if_missing() {
  local address="$1"
  local import_id="$2"
  local label="$3"

  if state_has "${address}"; then
    echo "Already tracked in state: ${label} (${address})"
    return 0
  fi

  echo "Importing existing ${label} into Terraform state: ${address}"
  terraform import "${tf_args[@]}" "${address}" "${import_id}"
}

manage_route53_records="$(tr '[:upper:]' '[:lower:]' <<< "$(get_tfvar_value "manage_route53_records")")"
route53_zone_id="$(get_tfvar_value "route53_hosted_zone_id")"
app_domain_name="$(tr '[:upper:]' '[:lower:]' <<< "$(get_tfvar_value "app_domain_name")")"

if [[ "${manage_route53_records}" == "true" && -n "${route53_zone_id}" && -n "${app_domain_name}" ]]; then
  dns_record_name="${app_domain_name%.}."
  dns_count="$(aws route53 list-resource-record-sets \
    --hosted-zone-id "${route53_zone_id}" \
    --query "length(ResourceRecordSets[?Name == '${dns_record_name}' && Type == 'A'])" \
    --output text)"

  if [[ "${dns_count}" != "0" && "${dns_count}" != "None" ]]; then
    import_if_missing \
      "module.cloudfront[0].aws_route53_record.cloudfront[0]" \
      "${route53_zone_id}_${app_domain_name%.}_A" \
      "Route53 CloudFront alias record ${app_domain_name}"
  fi
fi

enable_vpc_flow_logs="$(tr '[:upper:]' '[:lower:]' <<< "$(get_tfvar_value "enable_vpc_flow_logs")")"
name_prefix="${PROJECT_NAME}-${ENVIRONMENT}"
vpc_flow_log_group_name="/aws/vpc/${name_prefix}-flow-logs"

if [[ "${enable_vpc_flow_logs}" == "true" ]]; then
  log_group_count="$(aws logs describe-log-groups \
    --log-group-name-prefix "${vpc_flow_log_group_name}" \
    --query "length(logGroups[?logGroupName == '${vpc_flow_log_group_name}'])" \
    --output text \
    --region "${AWS_REGION}")"

  if [[ "${log_group_count}" != "0" && "${log_group_count}" != "None" ]]; then
    import_if_missing \
      "module.network.aws_cloudwatch_log_group.vpc_flow_logs[0]" \
      "${vpc_flow_log_group_name}" \
      "CloudWatch VPC flow log group ${vpc_flow_log_group_name}"
  fi
fi

pending_secret_recovery=0

import_secret_if_available() {
  local address="$1"
  local secret_name="$2"

  if state_has "${address}"; then
    echo "Already tracked in state: Secrets Manager secret ${secret_name} (${address})"
    return 0
  fi

  if ! aws secretsmanager describe-secret --secret-id "${secret_name}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    return 0
  fi

  local deleted_date
  deleted_date="$(aws secretsmanager describe-secret \
    --secret-id "${secret_name}" \
    --region "${AWS_REGION}" \
    --query 'DeletedDate' \
    --output text 2>/dev/null || true)"

  if [[ -n "${deleted_date}" && "${deleted_date}" != "None" ]]; then
    echo "Secret is scheduled for deletion and cannot be imported yet: ${secret_name}"
    pending_secret_recovery=1
    return 0
  fi

  local secret_arn
  secret_arn="$(aws secretsmanager describe-secret \
    --secret-id "${secret_name}" \
    --region "${AWS_REGION}" \
    --query 'ARN' \
    --output text)"

  import_if_missing "${address}" "${secret_arn}" "Secrets Manager secret ${secret_name}"
}

import_secret_if_available "module.security.aws_secretsmanager_secret.jwt_hmac" "/${PROJECT_NAME}/${ENVIRONMENT}/jwt/hmac_secret"
import_secret_if_available "module.security.aws_secretsmanager_secret.root_admin_password" "/${PROJECT_NAME}/${ENVIRONMENT}/user/root_admin_password"
import_secret_if_available "module.security.aws_secretsmanager_secret.db_username" "/${PROJECT_NAME}/${ENVIRONMENT}/db/username"
import_secret_if_available "module.security.aws_secretsmanager_secret.db_password" "/${PROJECT_NAME}/${ENVIRONMENT}/db/password"

if [[ "${pending_secret_recovery}" == "1" ]]; then
  echo "One or more required secrets are scheduled for deletion. Run platform/terraform/scripts/force-delete-stale-resources.sh ${ENVIRONMENT} before rerunning the Terraform plan workflow."
  exit 1
fi
