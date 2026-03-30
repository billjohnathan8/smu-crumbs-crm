# AWS Transfer Family Module

This module provisions an AWS Transfer Family SFTP server for external transaction file ingestion.

## Overview

The Transfer Family SFTP server acts as an SFTP-to-S3 gateway, allowing external partners to upload transaction CSV files via standard SFTP protocol. Files uploaded via SFTP land directly in the configured S3 bucket, where the existing Lambda collector and transaction import flow process them.

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

## Features

- **Public SFTP endpoint**: No VPC configuration required
- **Service-managed identity**: SSH key-based authentication
- **S3 integration**: Files land directly in transaction S3 bucket
- **Logical home directory**: SFTP user root (/) maps to S3 bucket prefix
- **Feature flag**: Can be disabled per environment

## Usage

### Prerequisites

1. **Generate SSH key pair** (run once per user/environment):
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/crm-sftp-demo -N ""
   ```

2. **Retrieve public key**:
   ```bash
   cat ~/.ssh/crm-sftp-demo.pub
   ```

### Module Invocation

```hcl
module "transfer_family" {
  source = "./modules/transfer-family"

  enable_transfer_family_sftp = var.enable_transfer_family_sftp
  name_prefix                 = local.name_prefix
  environment                 = var.environment
  transaction_bucket_id       = module.s3.transaction_sftp_bucket_id
  transaction_bucket_prefix   = var.transaction_sftp_remote_prefix
  sftp_username               = var.sftp_username
  sftp_user_ssh_public_key    = var.sftp_user_ssh_public_key
  transfer_family_role_arn    = module.security.transfer_family_role_arn
}
```

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `enable_transfer_family_sftp` | bool | Feature flag to enable/disable Transfer Family |
| `sftp_username` | string | SFTP username for transaction uploads |
| `sftp_user_ssh_public_key` | string | SSH public key in OpenSSH format |
| `transfer_family_role_arn` | string | IAM role ARN for S3 access |

### Configuration Example

In your `terraform.tfvars` or environment-specific `.tfvars`:

```hcl
enable_transfer_family_sftp = true
sftp_username               = "crm-transaction-uploader"
sftp_user_ssh_public_key    = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC... user@host"
```

Or via environment variables:

```bash
export TF_VAR_enable_transfer_family_sftp=true
export TF_VAR_sftp_username="crm-transaction-uploader"
export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo.pub)"
```

### Outputs

After applying, retrieve connection details:

```bash
# Get SFTP endpoint
terraform output -raw sftp_endpoint

# Get username
terraform output -raw sftp_username

# Full connection string
echo "sftp -i ~/.ssh/crm-sftp-demo $(terraform output -raw sftp_username)@$(terraform output -raw sftp_endpoint)"
```

## Testing SFTP Upload

### Interactive SFTP Session

```bash
sftp -i ~/.ssh/crm-sftp-demo crm-transaction-uploader@<endpoint>

# Inside SFTP session:
put local-transactions.csv transactions-2026-03.csv
ls
bye
```

### Scripted Upload

```bash
sftp -i ~/.ssh/crm-sftp-demo \
     -o StrictHostKeyChecking=no \
     -o UserKnownHostsFile=/dev/null \
     crm-transaction-uploader@<endpoint> <<EOF
put local-transactions.csv transactions-2026-03.csv
bye
EOF
```

### Verification

1. **Check S3 bucket**: Verify file appears in `s3://<bucket>/incoming/`
2. **Check Lambda logs**: Ensure collector picks up the file
3. **Check transaction API**: Verify records imported successfully

## Security Considerations

### SSH Key Management

- **Private key**: NEVER commit to version control, store securely on local machine
- **Public key**: Safe to store in Terraform variables/tfvars (non-sensitive)
- **Key rotation**: Generate new key pair and update `sftp_user_ssh_public_key` variable

### IAM Role Permissions

The Transfer Family IAM role requires:
- `s3:PutObject` - Upload files
- `s3:GetObject` - Download files (optional)
- `s3:DeleteObject` - Delete files (optional)
- `s3:ListBucket` - List directory contents

See `modules/security/main.tf` for the complete IAM policy.

### Network Security

- **Public endpoint**: Accessible from any IP address
- **Authentication**: SSH key-based only (no password auth)
- **Encryption**: SFTP protocol encrypts data in transit

## Cost Considerations

AWS Transfer Family pricing (as of 2026):
- **SFTP endpoint**: ~$0.30/hour (~$216/month for 24/7 operation)
- **Data transfer**: $0.04/GB uploaded

**Cost optimization**:
- Disable in non-production environments using feature flag
- Consider scheduled provisioning (create before demo, destroy after)
- Monitor usage with CloudWatch metrics

## Troubleshooting

### Connection Refused

**Symptom**: `ssh: connect to host <endpoint> port 22: Connection refused`

**Solutions**:
- Verify `enable_transfer_family_sftp = true` in tfvars
- Check Transfer Family server is in "ONLINE" state (AWS Console)
- Wait 1-2 minutes after `terraform apply` for endpoint to become available

### Authentication Failed

**Symptom**: `Permission denied (publickey)`

**Solutions**:
- Verify SSH public key format is correct (must start with `ssh-rsa`, `ssh-ed25519`, etc.)
- Ensure private key file permissions are correct: `chmod 600 ~/.ssh/crm-sftp-demo`
- Verify username matches Terraform output: `terraform output -raw sftp_username`
- Check SSH key was registered: AWS Console → Transfer Family → Servers → Users → SSH keys

### File Upload Fails (Permission Denied)

**Symptom**: `Permission denied` or `Access denied` during file upload

**Solutions**:
- Verify IAM role has `s3:PutObject` permission on target bucket
- Check S3 bucket policy doesn't block Transfer Family service
- Verify home directory mapping is correct in Terraform

### File Not Found in S3

**Symptom**: SFTP upload succeeds but file doesn't appear in S3

**Solutions**:
- Check home directory mapping: files upload to `/<bucket>/<prefix>/`
- When uploading to SFTP root `/`, files land in configured S3 prefix
- Example: SFTP path `/transactions.csv` → S3 path `s3://<bucket>/incoming/transactions.csv`

## Limitations

- **No LocalStack support**: LocalStack Community edition doesn't support Transfer Family
- **Single user**: Module creates one SFTP user; extend for multi-user scenarios
- **No custom identity provider**: Uses service-managed (SSH key) auth only
- **No VPC endpoint**: Public endpoint only (suitable for demo/testing)

## References

- [AWS Transfer Family Documentation](https://docs.aws.amazon.com/transfer/latest/userguide/what-is-aws-transfer-family.html)
- [Transfer Family S3 Integration](https://docs.aws.amazon.com/transfer/latest/userguide/requirements-S3.html)
- [IAM Roles for Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/requirements-roles.html)
