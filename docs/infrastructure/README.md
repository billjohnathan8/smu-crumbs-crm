# Infrastructure Documentation

Documentation for the AWS infrastructure managed under `platform/terraform/`.

## Documents

| Document | Description |
|----------|-------------|
| [terraform-overview.md](terraform-overview.md) | Architecture overview - modules, design decisions, naming conventions, and service flows |
| [terraform-resource-inventory.md](terraform-resource-inventory.md) | Complete inventory of all Terraform modules and AWS resources |
| [stateful-services-scaling.md](stateful-services-scaling.md) | Scaling guardrails for in-memory stateful ECS services (`agent`, `transaction`) |
| [backend-setup.md](backend-setup.md) | Guide for configuring the S3 + DynamoDB remote state backend |
| [inframap-setup.md](inframap-setup.md) | Local setup for generating infrastructure diagrams with InfraMap and `terraform graph` |
| [architecture-conformance.md](architecture-conformance.md) | Conformance summary against the reference architecture diagram, with identified gaps and remediation plan |
| [cost-estimate.md](cost-estimate.md) | AWS cost baseline ($247.36/mo) with per-resource breakdown and guide for running Infracost locally |

## Core Commands for Terraform

### Step #1
```
terraform fmt -recursive
```

### Step #2
```
terraform validate
```

### Step #3
```
terraform plan
```

### Step #4 (Optional Visualization)
```bash
make inframap
make inframap-full
make terraform-graph
```

Generated outputs:
- `docs/infrastructure/generated/inframap/` (InfraMap outputs)
- `docs/infrastructure/generated/terraform-graph/` (Terraform dependency graph outputs)

## Optional Lambda Features and Artifacts

These Lambda-backed features are disabled by default so a clean checkout validates without local zip artifacts:

- `enable_log_lambda` (log-service Lambda + API Gateway)
- `enable_aml_lambda` (scheduled AML ingestion Lambda)
- `enable_audit_pipeline` (audit SQS + consumer Lambda + DynamoDB)
- `enable_aml_pipeline` (AML SQS + consumer Lambda + DynamoDB)
- `enable_verification_pipeline` (verification Lambda + SNS + S3 + SES integration)

When any of the above flags is set to `true`, Terraform enforces that the corresponding zip path exists and is non-empty.

Example commands (from repo root):

```bash
# Log service Lambda (+ API Gateway)
terraform -chdir=platform/terraform plan \
  -var='enable_log_lambda=true' \
  -var='log_lambda_zip_path=../../services/backend/log/log-lambda.zip'

# AML ingestion Lambda (EventBridge scheduled)
terraform -chdir=platform/terraform plan \
  -var='enable_aml_lambda=true' \
  -var='aml_lambda_zip_path=../../services/backend/aml/aml-lambda.zip'

# Audit pipeline consumer Lambda
terraform -chdir=platform/terraform plan \
  -var='enable_audit_pipeline=true' \
  -var='audit_consumer_zip_path=../../services/backend/audit-consumer/audit-consumer-lambda.zip'

# AML pipeline consumer Lambda
terraform -chdir=platform/terraform plan \
  -var='enable_aml_pipeline=true' \
  -var='aml_consumer_zip_path=../../services/backend/aml-consumer/aml-consumer-lambda.zip'

# Verification pipeline Lambda
terraform -chdir=platform/terraform plan \
  -var='enable_log_lambda=true' \
  -var='log_lambda_zip_path=../../services/backend/log/log-lambda.zip' \
  -var='enable_verification_pipeline=true' \
  -var='verification_zip_path=../../services/backend/verification/verification-lambda.zip'
```

## Local Dev vs Production

Use `environment=dev` for local/non-production workflows. Dev defaults are intentionally convenience-oriented.

For `environment=prod` Terraform now enforces:

- Strong explicit `jwt_hmac_secret` and `root_admin_password` inputs.
- `db_skip_final_snapshot=false` and `db_deletion_protection=true`.
- `db_multi_az=true` and backup retention of at least 7 days.
- `enable_multi_az_nat=true` to avoid single-AZ NAT dependency.

For local cost-saving/non-production teardown workflows, you can still override dev/staging values explicitly in `terraform.tfvars` or `TF_VAR_*` environment variables.

## Prod Readiness Checklist

- Set `environment = "prod"` (or `"production"`).
- Provide strong secret inputs via environment variables (`TF_VAR_jwt_hmac_secret`, `TF_VAR_root_admin_password`), not committed files.
- Confirm DB safety controls: final snapshot enabled, deletion protection enabled, Multi-AZ enabled.
- Confirm network HA: `enable_multi_az_nat = true`.
- Run `terraform -chdir=platform/terraform init -backend=false` and `terraform -chdir=platform/terraform validate` before `plan/apply`.
