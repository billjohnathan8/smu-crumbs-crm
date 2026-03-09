# Terraform Backend Configuration Guide

This document provides instructions for configuring Terraform remote state backend with S3 and DynamoDB for state locking.

## Overview

The Terraform configuration uses S3 for remote state storage and DynamoDB for state locking to enable team collaboration and prevent concurrent modifications.

## Prerequisites

Before initializing Terraform, you need:

1. **AWS Account** with appropriate permissions
2. **S3 Bucket** for storing Terraform state
3. **DynamoDB Table** for state locking
4. **AWS CLI** configured with valid credentials

## Step 1: Create Backend Resources

### Create S3 Bucket

```bash
# Set your desired bucket name (must be globally unique)
export BUCKET_NAME="your-terraform-state-bucket-name"
export AWS_REGION="ap-southeast-1"

# Create the S3 bucket
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

# Enable versioning (recommended for state file recovery)
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# Enable encryption at rest
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access (security best practice)
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
    IgnorePublicAcls=true,\
    BlockPublicPolicy=true,\
    RestrictPublicBuckets=true
```

### Create DynamoDB Table

```bash
# Set your desired table name
export TABLE_NAME="your-terraform-lock-table-name"

# Create DynamoDB table with LockID partition key
aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $AWS_REGION

# Wait for table to become active
aws dynamodb wait table-exists \
  --table-name $TABLE_NAME \
  --region $AWS_REGION
```

## Step 2: Configure Backend

### Create backend.hcl

Copy the example file and customize it:

```bash
cd platform/terraform
cp backend.hcl.example backend.hcl
```

Edit `backend.hcl` and set your values:

```hcl
bucket         = "your-terraform-state-bucket-name"
key            = "scroogebank-crm/dev/terraform.tfstate"
region         = "ap-southeast-1"
dynamodb_table = "your-terraform-lock-table-name"
encrypt        = true
```

### Create terraform.tfvars

Copy the example file and customize it:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and configure at minimum:

- Project and environment settings
- Network configuration
- Database credentials
- Lambda package paths
- Secrets (use secure methods, see Security section)

**IMPORTANT:** Add `terraform.tfvars` and `backend.hcl` to `.gitignore`:

```bash
# Add to .gitignore
echo "platform/terraform/terraform.tfvars" >> .gitignore
echo "platform/terraform/backend.hcl" >> .gitignore
```

## Step 3: Initialize Terraform

Initialize Terraform with the backend configuration:

```bash
cd platform/terraform

# Initialize with backend configuration
terraform init -backend-config=backend.hcl

# Verify initialization
terraform validate
```

You should see output similar to:

```
Initializing the backend...

Successfully configured the backend "s3"!
```

## Step 4: Verify Backend Configuration

Check that state is stored remotely:

```bash
# Plan will use remote state
terraform plan

# Check S3 bucket for state file
aws s3 ls s3://your-terraform-state-bucket-name/scroogebank-crm/dev/

# Check DynamoDB for lock table structure
aws dynamodb describe-table \
  --table-name your-terraform-lock-table-name \
  --query 'Table.KeySchema'
```

## Security Best Practices

### Secrets Management

**Never commit sensitive values to version control.** Use one of these methods:

#### Option 1: Environment Variables (Recommended for CI/CD)

```bash
export TF_VAR_jwt_hmac_secret="your-jwt-secret"
export TF_VAR_root_admin_password="your-admin-password"
export TF_VAR_db_username="your-db-username"

terraform apply
```

#### Option 2: AWS Secrets Manager / SSM Parameter Store

Store secrets in AWS and reference in your code:

```bash
# Store secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name "/crm/dev/jwt-secret" \
  --secret-string "your-jwt-secret"

# Lambda functions will retrieve at runtime using AWS SDK
```

The Lambda functions are already configured to retrieve secrets at runtime using the ARNs provided:
- `DB_USER_SECRET_ARN`
- `DB_PASSWORD_SECRET_ARN`  
- `JWT_HMAC_SECRET_ARN`

#### Option 3: Terraform Cloud / Enterprise

Use Terraform Cloud's sensitive variable storage.

### IAM Permissions

The IAM user or role running Terraform needs:

- `s3:*` on the state bucket
- `dynamodb:*` on the lock table
- Standard AWS service permissions for resources being created

### State Encryption

- S3 server-side encryption is enabled by default (`encrypt = true`)
- Consider using AWS KMS for additional control:

```hcl
# In backend.hcl
kms_key_id = "arn:aws:kms:REGION:ACCOUNT:key/KEY-ID"
```

## Migrating to Remote Backend

If you have existing local state:

```bash
# Initialize with backend config (Terraform will detect local state)
terraform init -backend-config=backend.hcl

# Terraform will prompt: "Do you want to copy existing state?"
# Type: yes

# Verify migration
terraform state list
```

## Troubleshooting

### Error: "Error acquiring the state lock"

Someone else is running Terraform. Wait for them to finish, or if stuck:

```bash
# Force unlock (use with caution!)
terraform force-unlock <LOCK_ID>
```

### Error: "NoSuchBucket"

The S3 bucket doesn't exist. Create it using Step 1.

### Error: "ResourceNotFoundException" (DynamoDB)

The DynamoDB table doesn't exist. Create it using Step 1.

### Error: "AccessDenied"

Check IAM permissions for your AWS credentials.

## Multi-Environment Setup

For multiple environments (dev, staging, prod), use different state paths:

```hcl
# backend-dev.hcl
key = "scroogebank-crm/dev/terraform.tfstate"

# backend-staging.hcl  
key = "scroogebank-crm/staging/terraform.tfstate"

# backend-prod.hcl
key = "scroogebank-crm/prod/terraform.tfstate"
```

Initialize each environment:

```bash
terraform init -backend-config=backend-dev.hcl -reconfigure
```

## Backend Configuration Reference

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `bucket` | Yes | S3 bucket name | `my-terraform-state` |
| `key` | Yes | Path to state file | `project/env/terraform.tfstate` |
| `region` | Yes | AWS region | `ap-southeast-1` |
| `dynamodb_table` | Yes | DynamoDB table for locking | `terraform-lock` |
| `encrypt` | No | Enable encryption (default: true) | `true` |
| `kms_key_id` | No | KMS key for encryption | `arn:aws:kms:...` |

## Additional Resources

- [Terraform S3 Backend Documentation](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [AWS S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [Terraform State Locking](https://www.terraform.io/docs/language/state/locking.html)
