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
  terraform state show "${address}" >/dev/null 2>&1
}

state_has_prefix() {
  local prefix="$1"
  terraform state list 2>/dev/null | grep -Eq "^${prefix}(\\.|\\[|$)"
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
  set +e
  local import_output
  import_output="$(terraform import "${tf_args[@]}" "${address}" "${import_id}" 2>&1)"
  local import_rc=$?
  set -e

  if [[ ${import_rc} -eq 0 ]]; then
    return 0
  fi

  if grep -Fq "Resource already managed by Terraform" <<< "${import_output}"; then
    echo "Already tracked in state during import attempt: ${label} (${address})"
    return 0
  fi

  echo "${import_output}"
  return "${import_rc}"
}

move_legacy_sftp_module_address_if_needed() {
  local old_prefix='module\.transfer_family'
  local new_prefix='module\.sftp_server'

  if state_has_prefix "${old_prefix}" && ! state_has_prefix "${new_prefix}"; then
    echo "Moving Terraform state address: legacy module.transfer_family -> module.sftp_server"
    terraform state mv module.transfer_family module.sftp_server
  fi
}

reconcile_sftp_server_if_needed() {
  local enable_ec2_sftp_server
  enable_ec2_sftp_server="$(tr '[:upper:]' '[:lower:]' <<< "$(get_tfvar_value "enable_ec2_sftp_server")")"

  if [[ "${enable_ec2_sftp_server}" != "true" ]]; then
    return 0
  fi

  local module_prefix='module\.sftp_server'
  if state_has_prefix "${module_prefix}"; then
    echo "SFTP module resources already tracked in state under module.sftp_server."
    return 0
  fi

  local name_prefix="${PROJECT_NAME}-${ENVIRONMENT}"
  local sg_name="${name_prefix}-sftp-ec2-sg"
  local role_name="${name_prefix}-sftp-ec2"
  local role_policy_name="${name_prefix}-sftp-ec2-s3"
  local instance_name="${name_prefix}-sftp-ec2"
  local eip_name="${name_prefix}-sftp-ec2-eip"

  local vpc_id
  vpc_id="$(terraform output -raw vpc_id 2>/dev/null || true)"

  local sg_id=""
  if [[ -n "${vpc_id}" ]]; then
    sg_id="$(aws ec2 describe-security-groups \
      --region "${AWS_REGION}" \
      --filters "Name=group-name,Values=${sg_name}" "Name=vpc-id,Values=${vpc_id}" \
      --query 'SecurityGroups[0].GroupId' \
      --output text 2>/dev/null || true)"
  fi
  if [[ -n "${sg_id}" && "${sg_id}" != "None" ]]; then
    import_if_missing "module.sftp_server.aws_security_group.sftp_ec2[0]" "${sg_id}" "SFTP security group ${sg_name}"
  fi

  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    import_if_missing "module.sftp_server.aws_iam_role.sftp_ec2[0]" "${role_name}" "SFTP IAM role ${role_name}"
  fi

  if aws iam get-instance-profile --instance-profile-name "${role_name}" >/dev/null 2>&1; then
    import_if_missing "module.sftp_server.aws_iam_instance_profile.sftp_ec2[0]" "${role_name}" "SFTP IAM instance profile ${role_name}"
  fi

  if aws iam get-role-policy --role-name "${role_name}" --policy-name "${role_policy_name}" >/dev/null 2>&1; then
    import_if_missing "module.sftp_server.aws_iam_role_policy.sftp_ec2_s3[0]" "${role_name}:${role_policy_name}" "SFTP IAM inline policy ${role_policy_name}"
  fi

  local instance_id
  instance_id="$(aws ec2 describe-instances \
    --region "${AWS_REGION}" \
    --filters "Name=tag:Name,Values=${instance_name}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || true)"
  if [[ -n "${instance_id}" && "${instance_id}" != "None" ]]; then
    import_if_missing "module.sftp_server.aws_instance.sftp_ec2[0]" "${instance_id}" "SFTP EC2 instance ${instance_name}"
  fi

  local eip_alloc_id
  eip_alloc_id="$(aws ec2 describe-addresses \
    --region "${AWS_REGION}" \
    --filters "Name=tag:Name,Values=${eip_name}" \
    --query 'Addresses[0].AllocationId' \
    --output text 2>/dev/null || true)"
  if [[ -n "${eip_alloc_id}" && "${eip_alloc_id}" != "None" ]]; then
    import_if_missing "module.sftp_server.aws_eip.sftp_ec2[0]" "${eip_alloc_id}" "SFTP Elastic IP ${eip_name}"
  fi
}

move_legacy_sftp_module_address_if_needed
reconcile_sftp_server_if_needed

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
