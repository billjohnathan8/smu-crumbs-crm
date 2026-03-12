# Terraform Backend Setup

Use this only when you need remote Terraform state for team/shared environments.

## Prerequisites

- AWS account with permissions for S3 and DynamoDB
- AWS CLI configured
- Terraform installed

## 1. Create Backend Resources

Create:
- One S3 bucket for state
- One DynamoDB table with `LockID` partition key for state locking

## 2. Create `backend.hcl`

From `platform/terraform`:

```bash
cp backend.hcl.example backend.hcl
```

Set your values:

```hcl
bucket         = "<your-state-bucket>"
key            = "scroogebank-crm/dev/terraform.tfstate"
region         = "ap-southeast-1"
dynamodb_table = "<your-lock-table>"
encrypt        = true
```

## 3. Initialize Terraform with Backend

```bash
terraform -chdir=platform/terraform init -backend-config=backend.hcl
terraform -chdir=platform/terraform validate
```

## 4. Configure Variables

```bash
cp platform/terraform/terraform.tfvars.example platform/terraform/terraform.tfvars
```

Do not commit real secrets in `terraform.tfvars`.
Prefer environment variables in CI/CD:

```bash
export TF_VAR_jwt_hmac_secret="<value>"
export TF_VAR_root_admin_password="<value>"
```

## Security Checklist

- Enable S3 versioning and encryption.
- Block public access on state bucket.
- Use least-privilege IAM for Terraform execution.
- Keep `backend.hcl` and `terraform.tfvars` out of commits if they contain sensitive values.
