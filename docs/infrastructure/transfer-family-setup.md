# AWS Transfer Family SFTP Setup Guide

## Overview

AWS Transfer Family provides a fully managed SFTP server for external transaction file ingestion. This guide covers setup, testing, and troubleshooting for the Transfer Family integration in the ScroogeBank CRM.

## Architecture

```
External Partner → SFTP Client → AWS Transfer Family (SFTP endpoint)
                                         ↓
                                    S3 Bucket (landing zone)
                                         ↓
                            Lambda Collector (sftp-transaction-collector)
                                         ↓
                            Transaction Service (import API)
```

### Key Components

- **AWS Transfer Family Server**: Managed SFTP endpoint (public, service-managed identity)
- **SFTP User**: Single user with SSH key-based authentication
- **S3 Integration**: SFTP user's home directory maps to S3 bucket prefix (`incoming/`)
- **IAM Role**: Grants Transfer Family S3 access (PutObject, GetObject, DeleteObject, ListBucket)
- **Existing Flow**: Lambda collector and transaction import flow remain unchanged

## Prerequisites

### 1. Generate SSH Key Pair

**Run this once per environment/user:**

```bash
# Generate RSA key pair (4096-bit recommended)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/crm-sftp-demo -N ""

# Alternative: ED25519 key (modern, shorter)
# ssh-keygen -t ed25519 -f ~/.ssh/crm-sftp-demo -N ""

# Verify key generation
ls -lh ~/.ssh/crm-sftp-demo*
# Should show:
#   ~/.ssh/crm-sftp-demo      (private key)
#   ~/.ssh/crm-sftp-demo.pub  (public key)

# View public key (this will be provided to Terraform)
cat ~/.ssh/crm-sftp-demo.pub
```

**Important**: Never commit the private key (`crm-sftp-demo`) to version control. Store it securely on your local machine only.

### 2. Configure Terraform with SSH Public Key

**Option A: Environment variable (recommended for CI/CD)**

```bash
export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo.pub)"
```

**Option B: tfvars file**

Edit `platform/terraform/env/integration.tfvars` or `platform/terraform/env/prod.tfvars`:

```hcl
enable_transfer_family_sftp = true
sftp_username               = "crm-transaction-uploader"
sftp_user_ssh_public_key    = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC... user@host"
```

**Option C: terraform.tfvars (not committed)**

Create `platform/terraform/terraform.tfvars`:

```hcl
sftp_user_ssh_public_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC... user@host"
```

## Deployment

### 1. Enable Transfer Family in Environment

Transfer Family is enabled/disabled per environment via the `enable_transfer_family_sftp` variable:

| Environment | Feature Flag | Reason |
|-------------|--------------|--------|
| **lab** | `false` | LabRole restrictions (transfer:CreateServer API not supported) |
| **local** | `false` | Not needed (LocalStack doesn't support Transfer Family) |
| **integration** | `true` | Enabled for testing/demo |
| **prod** | `true` | Enabled for production use |

### 2. Deploy Infrastructure

```bash
cd platform/terraform

# Initialize Terraform (if not already done)
terraform init

# Set SSH public key
export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo.pub)"

# Plan deployment
terraform plan -var-file=env/integration.tfvars

# Apply changes
terraform apply -var-file=env/integration.tfvars
```

### 3. Retrieve Connection Details

```bash
# Get SFTP endpoint
terraform output -raw sftp_endpoint
# Output: s-abc123xyz.server.transfer.ap-southeast-1.amazonaws.com

# Get SFTP username
terraform output -raw sftp_username
# Output: crm-transaction-uploader

# Get home directory target (S3 path where files land)
terraform output -raw sftp_home_directory_target
# Output: s3://scroogebank-crm-integration-transaction-sftp/incoming/
```

**Save these outputs for SFTP client configuration.**

## Testing SFTP Upload

### Method 1: Interactive SFTP Session

```bash
# Connect to SFTP server
sftp -i ~/.ssh/crm-sftp-demo crm-transaction-uploader@s-abc123xyz.server.transfer.ap-southeast-1.amazonaws.com

# Inside SFTP session:
sftp> ls
# Shows current directory (maps to S3 incoming/ prefix)

sftp> put local-transactions.csv transactions-2026-03.csv
Uploading local-transactions.csv to /transactions-2026-03.csv
local-transactions.csv                                     100%   12KB  120.5KB/s   00:00

sftp> ls
transactions-2026-03.csv

sftp> bye
```

### Method 2: Scripted Upload (Automation)

```bash
# Using heredoc for non-interactive upload
sftp -i ~/.ssh/crm-sftp-demo \
     -o StrictHostKeyChecking=no \
     -o UserKnownHostsFile=/dev/null \
     crm-transaction-uploader@s-abc123xyz.server.transfer.ap-southeast-1.amazonaws.com <<EOF
put local-transactions.csv transactions-2026-03.csv
bye
EOF
```

### Method 3: Helper Script

```bash
# Generate mock transaction data first
cd services/backend/transaction/mock-sftp
python mock_transactions.py \
  --output mocked_transactions.csv \
  --row-count 120 \
  --start-date 2026-01-01 \
  --end-date 2026-03-31

# Upload via Transfer Family SFTP
cd ../../../../
bash scripts/ci/upload-via-transfer-family.sh \
  --file services/backend/transaction/mock-sftp/mocked_transactions.csv \
  --sftp-endpoint $(cd platform/terraform && terraform output -raw sftp_endpoint) \
  --sftp-username $(cd platform/terraform && terraform output -raw sftp_username) \
  --ssh-key ~/.ssh/crm-sftp-demo \
  --remote-filename transactions-2026-03.csv
```

## Verification

### 1. Verify File in S3

```bash
# List files in S3 bucket
aws s3 ls s3://scroogebank-crm-integration-transaction-sftp/incoming/

# Expected output:
# 2026-03-30 10:15:23      12345 transactions-2026-03.csv
```

### 2. Verify Lambda Collector Trigger

```bash
# Check Lambda logs
aws logs tail /aws/lambda/scroogebank-crm-integration-sftp-transaction-collector --follow

# Expected log entries:
# [INFO] Found 1 new transaction files in S3
# [INFO] Processing: incoming/transactions-2026-03.csv
# [INFO] Triggered import API: POST /api/transactions/import
```

### 3. Verify Transaction Import

```bash
# Call transaction API to check imported records
curl -X GET "https://<alb-dns>/api/transactions?limit=10" \
  -H "Authorization: Bearer <jwt-token>"

# Or check database directly
# (Database queries depend on your schema and access method)
```

## SSH Key Management

### Key Rotation

To rotate SSH keys:

1. Generate new key pair:
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/crm-sftp-demo-new -N ""
   ```

2. Update Terraform variable:
   ```bash
   export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo-new.pub)"
   ```

3. Apply changes:
   ```bash
   terraform apply -var-file=env/integration.tfvars
   ```

4. Test new key:
   ```bash
   sftp -i ~/.ssh/crm-sftp-demo-new crm-transaction-uploader@<endpoint>
   ```

5. Archive old key:
   ```bash
   mv ~/.ssh/crm-sftp-demo ~/.ssh/crm-sftp-demo.old
   mv ~/.ssh/crm-sftp-demo-new ~/.ssh/crm-sftp-demo
   ```

### Multiple Users (Future Enhancement)

To add additional SFTP users, extend the Transfer Family module:

```hcl
# In modules/transfer-family/main.tf
resource "aws_transfer_user" "additional_users" {
  for_each = var.additional_sftp_users

  server_id = aws_transfer_server.sftp[0].id
  user_name = each.key
  role      = var.transfer_family_role_arn

  home_directory_type = "LOGICAL"
  home_directory_mappings {
    entry  = "/"
    target = "/${var.transaction_bucket_id}/${each.value.home_directory_prefix}"
  }
}
```

## Troubleshooting

### Connection Refused

**Symptom**: `ssh: connect to host <endpoint> port 22: Connection refused`

**Causes**:
- Transfer Family server not yet in "ONLINE" state
- Feature flag disabled (`enable_transfer_family_sftp = false`)
- Network connectivity issue

**Solutions**:
1. Check server state in AWS Console → Transfer Family → Servers
2. Wait 1-2 minutes after `terraform apply` for endpoint to become available
3. Verify `enable_transfer_family_sftp = true` in tfvars
4. Test network connectivity: `nc -zv <endpoint> 22`

### Permission Denied (publickey)

**Symptom**: `Permission denied (publickey)` during SFTP connection

**Causes**:
- SSH private key not found or wrong path
- SSH public key not registered in Terraform
- SSH key format incompatible
- SSH private key permissions too open

**Solutions**:
1. Verify private key exists: `ls -lh ~/.ssh/crm-sftp-demo`
2. Check key format: `head -1 ~/.ssh/crm-sftp-demo.pub` (should start with `ssh-rsa`, `ssh-ed25519`, etc.)
3. Fix permissions: `chmod 600 ~/.ssh/crm-sftp-demo`
4. Verify public key registered in Terraform:
   ```bash
   terraform state show 'module.transfer_family.aws_transfer_ssh_key.sftp_user[0]'
   ```
5. Re-apply Terraform if key was updated:
   ```bash
   terraform apply -var-file=env/integration.tfvars
   ```

### File Upload Fails (Permission Denied)

**Symptom**: `Permission denied` or `Access denied` during file upload

**Causes**:
- IAM role missing S3 permissions
- S3 bucket policy blocking Transfer Family
- Home directory mapping incorrect

**Solutions**:
1. Verify IAM role has `s3:PutObject` permission:
   ```bash
   aws iam get-role-policy \
     --role-name scroogebank-crm-integration-transfer-family-sftp \
     --policy-name scroogebank-crm-integration-transfer-family-s3
   ```
2. Check home directory mapping:
   ```bash
   terraform state show 'module.transfer_family.aws_transfer_user.sftp_user[0]'
   ```
3. Test S3 access directly (using Transfer Family role):
   ```bash
   aws s3 ls s3://scroogebank-crm-integration-transaction-sftp/incoming/
   ```

### File Not Found in S3 After Upload

**Symptom**: SFTP upload succeeds but file doesn't appear in S3

**Causes**:
- Home directory mapping mismatch
- SFTP path confusion (local vs. S3)
- S3 bucket versioning/replication delay

**Solutions**:
1. Understand path mapping:
   - SFTP path: `/transactions.csv`
   - S3 path: `s3://<bucket>/incoming/transactions.csv`
   - The SFTP root (`/`) maps to the S3 prefix (`incoming/`)
2. Check S3 bucket directly:
   ```bash
   aws s3 ls s3://scroogebank-crm-integration-transaction-sftp/incoming/ --recursive
   ```
3. Review Transfer Family CloudWatch logs:
   ```bash
   aws logs tail /aws/transfer/s-abc123xyz --follow
   ```

### SSH Key Format Error

**Symptom**: Terraform validation error: "sftp_user_ssh_public_key must be a valid SSH public key"

**Causes**:
- Wrong key format (expecting OpenSSH format)
- PEM format key provided
- Extra whitespace or newlines

**Solutions**:
1. Verify key format:
   ```bash
   head -1 ~/.ssh/crm-sftp-demo.pub
   # Should output: ssh-rsa AAAAB3NzaC1yc2EAAAA... user@host
   ```
2. Convert PEM to OpenSSH (if needed):
   ```bash
   ssh-keygen -i -m PKCS8 -f key.pem > key.pub
   ```
3. Remove extra whitespace:
   ```bash
   export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo.pub | tr -d '\n\r')"
   ```

## Cost Considerations

### Pricing (AWS ap-southeast-1, as of March 2026)

- **SFTP endpoint**: ~$0.30/hour = **$216/month** (24/7 operation)
- **Data transfer**: $0.04/GB uploaded + $0.09/GB downloaded (to internet)
- **No charge**: S3 storage, Lambda invocations (covered by S3/Lambda pricing)

### Cost Optimization

1. **Disable in non-production**:
   ```hcl
   # env/lab.tfvars
   enable_transfer_family_sftp = false
   ```

2. **Scheduled provisioning** (create before demo, destroy after):
   ```bash
   # Create for demo
   terraform apply -var-file=env/integration.tfvars -target=module.transfer_family

   # Destroy after demo
   terraform destroy -var-file=env/integration.tfvars -target=module.transfer_family
   ```

3. **Use in integration only**:
   - Enable in `integration` environment for testing
   - Disable in `prod` until external partner integration is confirmed

### Monthly Cost Estimate

| Scenario | SFTP Uptime | Data Transfer | Total/Month |
|----------|-------------|---------------|-------------|
| Always-on (prod) | 24/7 | 10 GB/month | $216 + $1.30 = **$217.30** |
| Demo/testing (2 hours/day) | ~60 hours/month | 1 GB/month | $18 + $0.13 = **$18.13** |
| On-demand (deploy before demo) | 10 hours/month | 0.5 GB/month | $3 + $0.07 = **$3.07** |

## References

- [AWS Transfer Family Documentation](https://docs.aws.amazon.com/transfer/latest/userguide/what-is-aws-transfer-family.html)
- [Transfer Family S3 Integration](https://docs.aws.amazon.com/transfer/latest/userguide/requirements-S3.html)
- [IAM Roles for Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/requirements-roles.html)
- [OpenSSH Key Formats](https://www.openssh.com/txt/release-7.8)

## Support

For issues or questions:
1. Check CloudWatch Logs: `/aws/transfer/<server-id>`
2. Review Terraform state: `terraform state list | grep transfer_family`
3. Consult [TESTING-GUIDE.md](../testing/TESTING-GUIDE.md) for smoke tests
4. Raise issue in project repository: [GitHub Issues](https://github.com/cs301-itsa/project-2025-26t2-g2-t3/issues)
