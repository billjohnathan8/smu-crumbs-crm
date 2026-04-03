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

  if [[ -z "${import_id}" || "${import_id}" == "None" || "${import_id}" == "null" ]]; then
    echo "Unable to resolve existing rule id for ${label} (${address})"
    exit 1
  fi

  echo "Importing existing ${label} into Terraform state: ${address} -> ${import_id}"
  set +e
  local import_output
  import_output="$(terraform import "${tf_args[@]}" "${address}" "${import_id}" 2>&1)"
  local import_rc=$?
  set -e

  if [[ ${import_rc} -eq 0 ]]; then
    return 0
  fi

  if grep -Fq "Resource already managed by Terraform" <<< "${import_output}" \
    || grep -Fq "already managing a remote object for ${address}" <<< "${import_output}"; then
    echo "Already tracked in state during import attempt: ${label} (${address})"
    return 0
  fi

  echo "${import_output}"
  return "${import_rc}"
}

find_sg_id_by_name() {
  local group_name="$1"
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${group_name}" \
    --query "SecurityGroups[0].GroupId" \
    --output text \
    --region "${AWS_REGION}"
}

name_prefix="${PROJECT_NAME}-${ENVIRONMENT}"
alb_sg_name="${name_prefix}-alb-sg"
ecs_sg_name="${name_prefix}-ecs-sg"
lambda_sg_name="${name_prefix}-lambda-sg"

alb_sg_id="$(find_sg_id_by_name "${alb_sg_name}")"
ecs_sg_id="$(find_sg_id_by_name "${ecs_sg_name}")"
lambda_sg_id="$(find_sg_id_by_name "${lambda_sg_name}")"
cf_prefix_list_id="$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query "PrefixLists[0].PrefixListId" --output text --region "${AWS_REGION}")"

if [[ -z "${alb_sg_id}" || "${alb_sg_id}" == "None" ]]; then
  echo "Unable to resolve ALB SG id for ${alb_sg_name}"
  exit 1
fi
if [[ -z "${ecs_sg_id}" || "${ecs_sg_id}" == "None" ]]; then
  echo "Unable to resolve ECS SG id for ${ecs_sg_name}"
  exit 1
fi
if [[ -z "${lambda_sg_id}" || "${lambda_sg_id}" == "None" ]]; then
  echo "Unable to resolve Lambda SG id for ${lambda_sg_name}"
  exit 1
fi
if [[ -z "${cf_prefix_list_id}" || "${cf_prefix_list_id}" == "None" ]]; then
  echo "Unable to resolve CloudFront origin-facing prefix list id"
  exit 1
fi

echo "Resolved security groups:"
echo "  ALB SG:    ${alb_sg_id} (${alb_sg_name})"
echo "  ECS SG:    ${ecs_sg_id} (${ecs_sg_name})"
echo "  Lambda SG: ${lambda_sg_id} (${lambda_sg_name})"
echo "  Prefix list: ${cf_prefix_list_id}"

# aws_security_group_rule import format is:
# SECURITY_GROUP_ID_TYPE_PROTOCOL_FROMPORT_TOPORT_SOURCE
# Sources are CIDR/prefix-list/security-group id.
alb_ingress_cf_import_id="${alb_sg_id}_ingress_tcp_443_443_${cf_prefix_list_id}"
ecs_ingress_from_alb_import_id="${ecs_sg_id}_ingress_tcp_8080_8080_${alb_sg_id}"
ecs_ingress_self_import_id="${ecs_sg_id}_ingress_tcp_8080_8080_${ecs_sg_id}"
ecs_egress_https_import_id="${ecs_sg_id}_egress_tcp_443_443_0.0.0.0/0"
ecs_egress_self_import_id="${ecs_sg_id}_egress_tcp_8080_8080_${ecs_sg_id}"
lambda_egress_https_import_id="${lambda_sg_id}_egress_tcp_443_443_0.0.0.0/0"
sftp_ec2_sg_name="${name_prefix}-sftp-ec2-sg"
sftp_ec2_sg_id="$(find_sg_id_by_name "${sftp_ec2_sg_name}")"
lambda_egress_to_sftp_import_id=""
if [[ -n "${sftp_ec2_sg_id}" && "${sftp_ec2_sg_id}" != "None" ]]; then
  lambda_egress_to_sftp_import_id="${lambda_sg_id}_egress_tcp_22_22_${sftp_ec2_sg_id}"
fi

import_if_missing "module.security.aws_security_group_rule.alb_ingress_from_cloudfront[0]" "${alb_ingress_cf_import_id}" "ALB ingress 443 from CloudFront prefix list"
import_if_missing "module.security.aws_security_group_rule.ecs_ingress_from_alb" "${ecs_ingress_from_alb_import_id}" "ECS ingress 8080 from ALB SG"
import_if_missing "module.security.aws_security_group_rule.ecs_ingress_self" "${ecs_ingress_self_import_id}" "ECS self-ingress 8080"
import_if_missing "module.security.aws_security_group_rule.ecs_egress_https" "${ecs_egress_https_import_id}" "ECS egress 443 to 0.0.0.0/0"
import_if_missing "module.security.aws_security_group_rule.ecs_egress_self" "${ecs_egress_self_import_id}" "ECS self-egress 8080"
import_if_missing "module.security.aws_security_group_rule.lambda_egress_https" "${lambda_egress_https_import_id}" "Lambda egress 443 to 0.0.0.0/0"
if [[ -n "${lambda_egress_to_sftp_import_id}" ]]; then
  import_if_missing "module.security.aws_security_group_rule.lambda_egress_to_sftp_server[0]" "${lambda_egress_to_sftp_import_id}" "Lambda egress 22 to SFTP EC2 SG"
else
  echo "Skipping Lambda->SFTP SG rule import: SFTP SG ${sftp_ec2_sg_name} not found."
fi

echo "Security group rule reconciliation complete."
