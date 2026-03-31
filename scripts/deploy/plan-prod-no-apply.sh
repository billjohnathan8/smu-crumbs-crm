#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TF_DIR="$REPO_ROOT/platform/terraform"
BACKEND_FILE="$TF_DIR/env/prod.backend.hcl"
TFVARS_FILE="$TF_DIR/env/prod.tfvars"
PLAN_FILE="tfplan-prod-no-apply"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

step() {
  echo ""
  echo "[STEP] $1"
}

ok() {
  echo "[OK] $1"
}

command -v terraform >/dev/null 2>&1 || fail "terraform not found in PATH."
command -v aws >/dev/null 2>&1 || fail "aws not found in PATH."
[[ -f "$BACKEND_FILE" ]] || fail "Backend config not found: $BACKEND_FILE"
[[ -f "$TFVARS_FILE" ]] || fail "tfvars not found: $TFVARS_FILE"

grep -Eq 'bucket[[:space:]]*=[[:space:]]*"crumbs-scroogebank-tfstate"' "$BACKEND_FILE" \
  || fail "Expected backend bucket 'crumbs-scroogebank-tfstate' not found in $BACKEND_FILE."

step "Validating AWS credentials"
aws sts get-caller-identity >/dev/null
ok "AWS credentials are valid."

pushd "$TF_DIR" >/dev/null
step "terraform init (prod backend)"
terraform init -reconfigure -backend-config="env/prod.backend.hcl"
ok "terraform init complete."

step "terraform plan (prod tfvars, no apply)"
terraform plan -var-file="env/prod.tfvars" -out="$PLAN_FILE"
ok "terraform plan complete."

step "Saving human-readable plan to plan-prod-no-apply.txt"
terraform show -no-color "$PLAN_FILE" > "plan-prod-no-apply.txt"
ok "Saved plan to platform/terraform/plan-prod-no-apply.txt"
popd >/dev/null

echo ""
echo "[DONE] Plan-only run completed. No resources were applied."

