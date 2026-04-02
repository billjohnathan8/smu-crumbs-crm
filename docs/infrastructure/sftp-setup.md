# SFTP Ingestion Setup (EC2 + S3)

## Overview

Production SFTP ingestion uses a self-hosted EC2 SFTP server (OpenSSH + `mount-s3`).

Flow remains unchanged:

`Partner SFTP client -> SFTP endpoint -> S3 transaction bucket/prefix -> sftp-transaction-collector Lambda -> transaction import API`

## Active Terraform Flags (prod)

In `platform/terraform/env/prod.tfvars`:

```hcl
enable_ec2_sftp_server      = true
enable_sftp_transaction_collector = true
```

## Partner Key Onboarding

1. Generate partner key pair:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/crm-sftp-partner1 -N ""
```

2. Register the partner public key in Terraform:

```bash
export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-partner1.pub)"
```

3. Restrict inbound SFTP to partner public NAT CIDRs:

```hcl
sftp_ingress_cidr_blocks = ["203.0.113.10/32"] # replace with real partner CIDRs
```

4. Apply Terraform and retrieve endpoint:

```bash
cd platform/terraform
terraform output -raw sftp_endpoint
terraform output -raw sftp_username
terraform output -raw sftp_home_directory_target
```

## Partner Upload Example

```bash
sftp -i ~/.ssh/crm-sftp-partner1 <sftp-username>@<sftp-endpoint> <<EOF
put ./transactions.csv transactions-2026-03.csv
bye
EOF
```

Uploaded files land in:

`s3://<transaction-bucket>/<transaction-prefix>/`

## Verification

```bash
# 1) Check object landed in S3
aws s3 ls s3://crumbs-scroogebank-backend/incoming/

# 2) Check ingestion Lambda
aws logs tail /aws/lambda/scroogebank-crm-prod-sftp-transaction-collector --follow
```

## Notes

- The EC2 SFTP host is configured for SFTP-only access (no interactive shell).