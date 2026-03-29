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