# Documentation Hub

This directory keeps only current, high-signal docs.

## Start Here

- Onboarding: [onboarding/new-dev-setup.md](onboarding/new-dev-setup.md)
- Configuration: [database_configuration.md](database_configuration.md)
- Testing: [testing/TESTING-GUIDE.md](testing/TESTING-GUIDE.md)
- Troubleshooting: [troubleshooting.md](troubleshooting.md)

## Development Standards

- Coding standards: [coding-standards/coding-standards.md](coding-standards/coding-standards.md)
- Frontend guide: [frontend/README.md](frontend/README.md)

## AWS Deployment

- Learner Lab one-command deploy: `.\scripts\deploy-learnerlab.ps1` (PowerShell) or `./scripts/deploy-learnerlab.sh` (Bash)
- Terraform plan/apply/destroy: `.\scripts\deploy\deploy-aws.ps1 -Env lab`
- Learner Lab runbook: [diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md](diff/prep-learnerlab/BILL_LEARNERLAB_RUNBOOK.md)
- First AWS deployment (full account): [diff/prep-learnerlab/FIRST_DEPLOYMENT_RUNBOOK.md](diff/prep-learnerlab/FIRST_DEPLOYMENT_RUNBOOK.md)

## Architecture and Platform

- Local infrastructure: [infrastructure/localstack-setup.md](infrastructure/localstack-setup.md)
- Infrastructure diagrams and tools: [infrastructure/inframap-setup.md](infrastructure/inframap-setup.md)
- ADR index: [architectural-decisions-record/README.md](architectural-decisions-record/README.md)
- API contracts: [api-contracts/openapi](api-contracts/openapi)
- SFTP transaction collector contract: [api-contracts/sftp-transaction-ingestion-contract.md](api-contracts/sftp-transaction-ingestion-contract.md)

## Terraform Infrastructure Workflow

Scope: Terraform in `platform/terraform` and local AWS emulation with LocalStack.

Core commands:

```bash
terraform -chdir=platform/terraform fmt -recursive
terraform -chdir=platform/terraform validate
terraform -chdir=platform/terraform plan
python scripts/pipelines/test_terraform.py
```

`scripts/pipelines/test_terraform.py` runs the Terraform-only local pipeline and is isolated from `test_all.py`.

Environment-scoped planning for shared AWS environments:

```bash
terraform -chdir=platform/terraform init -reconfigure -backend-config=env/integration.backend.hcl
terraform -chdir=platform/terraform plan -var-file=env/integration.tfvars
```

Diagram commands:

```bash
make inframap
make inframap-full
make terraform-graph
```

Outputs:
- `docs/infrastructure/generated/inframap/`
- `docs/infrastructure/generated/terraform-graph/`

## Terraform Remote State Setup

Use remote state for team/shared environments.

Prerequisites:
- AWS account with S3 + DynamoDB permissions
- AWS CLI configured
- Terraform installed

Backend resources:
- One S3 bucket for Terraform state
- One DynamoDB table with `LockID` partition key for state locking

Create `backend.hcl` from template in `platform/terraform`:

```bash
cp backend.hcl.example backend.hcl
```

Example backend config:

```hcl
bucket         = "<your-state-bucket>"
key            = "scroogebank-crm/dev/terraform.tfstate"
region         = "ap-southeast-1"
dynamodb_table = "<your-lock-table>"
encrypt        = true
```

Initialize with backend:

```bash
terraform -chdir=platform/terraform init -backend-config=backend.hcl
terraform -chdir=platform/terraform validate
```

CI behavior:
- Terraform CI generates a reviewable plan artifact using:
  - `env/integration.backend.hcl`
  - `env/integration.tfvars`
- CI never runs `terraform apply`; apply remains manually controlled.

Security checklist:
- Enable S3 versioning and encryption
- Block public access on state bucket
- Use least-privilege IAM for Terraform execution
- Keep `backend.hcl` and `terraform.tfvars` out of commits when sensitive

## Cognito Rollout and Auth Modes

Safe migration path from local HS256 tokens to Cognito RS256 tokens.

Runtime auth modes:
- `local`: local HS256 tokens only
- `hybrid`: local HS256 + Cognito RS256
- `cognito`: Cognito RS256 only

Backend Cognito settings:
- `COGNITO_ISSUER`
- `COGNITO_AUDIENCE`
- `COGNITO_JWKS_URL`

Terraform rollout inputs:
- `auth_mode` (`local|hybrid|cognito`)
- `cognito_issuer_url` (optional override)
- `cognito_jwks_url` (optional override)
- `cognito_audience` (optional override)
- `cognito_mfa_configuration` (`OFF|OPTIONAL|ON`)

Example:

```bash
export TF_VAR_enable_cognito=true
export TF_VAR_auth_mode=hybrid
export TF_VAR_cognito_mfa_configuration=OPTIONAL
terraform -chdir=platform/terraform plan
terraform -chdir=platform/terraform apply
```

Phased rollout:
1. `local` baseline everywhere
2. non-prod to `hybrid` and validate both token paths
3. frontend Cognito cutover in `hybrid`
4. move to `cognito` after validation and rollback readiness

Rollback:
1. set `auth_mode=local`
2. redeploy ECS services
3. rerun smoke tests for login + protected APIs

## Operational Safety Notes

- Production-like environments keep stronger Cognito MFA posture:
  - `integration`: `cognito_mfa_configuration="OPTIONAL"`
  - `prod`: `cognito_mfa_configuration="ON"`
- CloudWatch alarms in production-like environments are wired to SNS actions.
- Set `alarm_notification_email` or `alarm_notification_topic_arn` before apply.

## Notes

- `docs/prompts/` is intentionally kept as-is.
- Historical and one-off implementation reports were removed to reduce drift and clutter.
