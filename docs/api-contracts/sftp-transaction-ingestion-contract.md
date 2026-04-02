# Transaction Ingestion Contract

## Overview

Transaction files can be ingested via three supported paths:

1. **EC2 SFTP** (integration/prod) - Real SFTP protocol via self-hosted OpenSSH on EC2
2. **Direct S3 Upload** (all environments) - AWS CLI or SDK direct upload to S3
3. **Filesystem Mock** (local dev only) - Files read from `MOCK_SFTP_ROOT` directory

All paths converge to the same S3 bucket landing zone, where the scheduled Lambda collector and transaction import flow process files identically.

## Path 1: EC2 SFTP (Integration/Prod)

**Availability**: Enabled when `enable_ec2_sftp_server = true`

**Architecture**:

```text
External Partner -> SFTP Client -> EC2 OpenSSH SFTP endpoint
                                      |
                                      v
                                S3 Bucket (landing zone)
                                      |
                                      v
                      Lambda Collector (sftp-transaction-collector)
                                      |
                                      v
                        Transaction Service (import API)
```

**Connection Details** (retrieve from Terraform outputs):
- **Endpoint**: `terraform output -raw sftp_endpoint`
- **Username**: `terraform output -raw sftp_username`
- **Authentication**: SSH key-based (public key registered in Terraform, private key kept locally)
- **Upload Path**: `/` (SFTP root maps to S3 `incoming/` prefix)

**Upload Example**:

```bash
# Interactive SFTP session
sftp -i ~/.ssh/crm-sftp-demo crm-transaction-uploader@<endpoint>
put local-transactions.csv transactions-2026-03.csv
bye

# Or using helper script
bash scripts/ci/upload-via-sftp.sh \
  --file ./transactions.csv \
  --sftp-endpoint <endpoint> \
  --sftp-username <username> \
  --ssh-key ~/.ssh/crm-sftp-demo \
  --remote-filename transactions-2026-03.csv
```

## Path 2: Direct S3 Upload (All Environments)

**Availability**: All environments (local, lab, integration, prod)

**Upload Example**:

```bash
aws s3 cp transactions.csv s3://scroogebank-crm-dev-transaction-sftp/incoming/transactions-2026-03.csv
```

## Path 3: Filesystem Mock (Local Dev Only)

**Availability**: Local development only (when `TRANSACTION_SFTP_BUCKET` is not configured)

**Usage**:

```bash
# Place CSV files in mock directory
cp transactions.csv services/backend/transaction/mock-sftp/transactions.csv

# Call import API with filesystem path
curl -X POST http://localhost:8083/api/transactions/import \
  -H "Content-Type: application/json" \
  -d '{"sourcePath":"file:///app/mock-sftp/transactions.csv"}'
```

## Common Import Flow (All Paths)

1. **Lambda Collector** (`sftp-transaction-collector`) runs on schedule
2. Lambda scans S3 prefix `incoming/` for CSV files
3. Lambda calls `POST /api/transactions/import` with `{"sourcePath":"s3://<bucket>/<key>"}`
4. **Transaction Service** reads CSV from S3 (or filesystem if local)

## Compatibility Notes

- Variable/property names retain `sftp` for backward compatibility:
  - `TRANSACTION_SFTP_BUCKET`
  - `transaction_sftp_*`
- These names refer to the S3 landing zone, not a specific transport implementation.

## Environment Configuration

| Environment | EC2 SFTP | Direct S3 Upload | Filesystem Mock |
|-------------|----------|------------------|-----------------|
| **lab** | Disabled by default | Enabled | N/A |
| **local** | Disabled by default | Enabled (via LocalStack) | Enabled |
| **integration** | Optional | Enabled | N/A |
| **prod** | Optional (recommended if partner SFTP needed) | Enabled | N/A |

## References

- SFTP setup: [sftp-setup.md](../infrastructure/sftp-setup.md)
- Testing Guide: [TESTING-GUIDE.md](../testing/TESTING-GUIDE.md)
- SFTP Collector README: [services/backend/sftp-transaction-collector/README.md](../../services/backend/sftp-transaction-collector/README.md)
