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

## Terraform Infrastructure

- Terraform Infrastructure Workflow: [infrastructure/terraform-infra-workflow.md](infrastructure/terraform-infra-workflow.md)
- Terraform Remote State Setup: [infrastructure/terraform-remote-state.md](infrastructure/terraform-remote-state.md)
- Cognito Rollout and Auth Modes: [infrastructure/cognito-auth.md](infrastructure/cognito-auth.md)

## Notes

- `docs/prompts/` is intentionally kept as-is.
- Historical and one-off implementation reports were removed to reduce drift and clutter.
