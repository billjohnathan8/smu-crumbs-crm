# Infrastructure Guide

Scope: Terraform in `platform/terraform` and local AWS emulation with LocalStack.

## Start Here

- Terraform workflow (format/validate/plan)
- LocalStack for local integration testing
- Optional infra diagrams via InfraMap / `terraform graph`
- Environment feature contract: [../configuration.md](../configuration.md)

## Terraform Commands

```bash
terraform -chdir=platform/terraform fmt -recursive
terraform -chdir=platform/terraform validate
terraform -chdir=platform/terraform plan
```

## Diagram Commands

```bash
make inframap
make inframap-full
make terraform-graph
```

Outputs:
- `docs/infrastructure/generated/inframap/`
- `docs/infrastructure/generated/terraform-graph/`

## Key Runbooks

- Remote state backend setup: [backend-setup.md](backend-setup.md)
- LocalStack setup: [localstack-setup.md](localstack-setup.md)
- Diagram setup/troubleshooting: [inframap-setup.md](inframap-setup.md)
- Auth migration: [auth-cognito-safe-rollout.md](auth-cognito-safe-rollout.md)

## Notes

- Keep `environment=dev` for local/non-production workflows.
- Environment-specific Terraform contracts are stored in `platform/terraform/env/*.tfvars`.
- Provide production secrets via `TF_VAR_*` environment variables, not committed files.
- Snapshot reports and one-off implementation notes were removed from this folder to reduce drift.
