# Infrastructure Documentation

Documentation for the AWS infrastructure managed under `platform/terraform/`.

## Documents

| Document | Description |
|----------|-------------|
| [terraform-overview.md](terraform-overview.md) | Architecture overview - modules, design decisions, naming conventions, and service flows |
| [terraform-resource-inventory.md](terraform-resource-inventory.md) | Complete inventory of all Terraform modules and AWS resources |
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
