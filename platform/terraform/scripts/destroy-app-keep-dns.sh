#!/usr/bin/env bash
set -euo pipefail

# Destroys app infrastructure while keeping critical DNS alias records in Route53.
# It detaches protected DNS records from Terraform state before destroy.
#
# Usage:
#   ./scripts/destroy-app-keep-dns.sh [environment] [extra-var-file]
# Example:
#   ./scripts/destroy-app-keep-dns.sh prod
#   ./scripts/destroy-app-keep-dns.sh prod runtime.auto.tfvars

ENVIRONMENT="${1:-prod}"
EXTRA_VAR_FILE="${2:-}"

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform is required but was not found in PATH."
  exit 1
fi

if [[ ! -f "env/${ENVIRONMENT}.tfvars" ]]; then
  echo "Missing var-file: env/${ENVIRONMENT}.tfvars"
  exit 1
fi

mapfile -t STATE_ADDRESSES < <(terraform state list 2>/dev/null || true)
if [[ "${#STATE_ADDRESSES[@]}" -gt 0 ]]; then
  for target in \
    "module.alb.aws_route53_record.alb[0]" \
    "module.cloudfront[0].aws_route53_record.cloudfront[0]" \
    "aws_route53_record.cloudfront_backend_origin[0]"
  do
    if printf '%s\n' "${STATE_ADDRESSES[@]}" | grep -Fxq "$target"; then
      echo "Detaching from state: $target"
      terraform state rm "$target" >/dev/null
    fi
  done
fi

TF_ARGS=(
  "destroy"
  "-auto-approve"
  "-var-file=env/${ENVIRONMENT}.tfvars"
)

if [[ -f "runtime.auto.tfvars" ]]; then
  TF_ARGS+=("-var-file=runtime.auto.tfvars")
fi

if [[ -n "$EXTRA_VAR_FILE" ]]; then
  if [[ ! -f "$EXTRA_VAR_FILE" ]]; then
    echo "Extra var-file not found: $EXTRA_VAR_FILE"
    exit 1
  fi
  TF_ARGS+=("-var-file=$EXTRA_VAR_FILE")
fi

echo "Running: terraform ${TF_ARGS[*]}"
terraform "${TF_ARGS[@]}"
