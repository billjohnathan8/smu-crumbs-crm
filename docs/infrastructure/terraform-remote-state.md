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