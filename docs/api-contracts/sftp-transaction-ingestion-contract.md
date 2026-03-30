# Transaction Ingestion Contract

## Overview

Transaction files can be ingested via three supported paths:

1. **AWS Transfer Family SFTP** (integration/prod) - Real SFTP protocol via AWS Transfer Family
2. **Direct S3 Upload** (all environments) - AWS CLI or SDK direct upload to S3
3. **Filesystem Mock** (local dev only) - Files read from `MOCK_SFTP_ROOT` directory

All paths converge to the same S3 bucket landing zone, where the scheduled Lambda collector and transaction import flow process files identically.

## Path 1: AWS Transfer Family SFTP (Integration/Prod)

**Availability**: Enabled in `integration` and `prod` environments via `enable_transfer_family_sftp = true`

**Architecture**:
```
External Partner → SFTP Client → AWS Transfer Family (SFTP endpoint)
                                         ↓
                                    S3 Bucket (landing zone)
                                         ↓
                            Lambda Collector (sftp-transaction-collector)
                                         ↓
                            Transaction Service (import API)
```

**Connection Details** (retrieve from Terraform outputs):
- **Endpoint**: `terraform output -raw sftp_endpoint`
  Example: `s-abc123xyz.server.transfer.ap-southeast-1.amazonaws.com`
- **Username**: `terraform output -raw sftp_username`
  Example: `crm-transaction-uploader`
- **Authentication**: SSH key-based (public key registered in Terraform, private key kept locally)
- **Upload Path**: `/` (SFTP root maps to S3 `incoming/` prefix)

**Upload Example**:
```bash
# Interactive SFTP session
sftp -i ~/.ssh/crm-sftp-demo crm-transaction-uploader@<endpoint>
put local-transactions.csv transactions-2026-03.csv
bye

# Or using helper script
bash scripts/ci/upload-via-transfer-family.sh \
  --file ./transactions.csv \
  --sftp-endpoint <endpoint> \
  --sftp-username <username> \
  --ssh-key ~/.ssh/crm-sftp-demo \
  --remote-filename transactions-2026-03.csv
```

**File Landing**: Files uploaded via SFTP land in S3 bucket at `s3://<bucket>/incoming/<filename>`, identical to direct S3 uploads.

**Documentation**: See [transfer-family-setup.md](../infrastructure/transfer-family-setup.md) for detailed setup and troubleshooting.

## Path 2: Direct S3 Upload (All Environments)

**Availability**: All environments (local, lab, integration, prod)

**Architecture**:
```
External Partner → AWS CLI/SDK → S3 Bucket (landing zone)
                                         ↓
                            Lambda Collector (sftp-transaction-collector)
                                         ↓
                            Transaction Service (import API)
```

**Upload Example**:
```bash
# Using AWS CLI
aws s3 cp transactions.csv s3://scroogebank-crm-dev-transaction-sftp/incoming/transactions-2026-03.csv

# Using seed script
bash scripts/ci/seed-transaction-fixture.sh \
  --environment local \
  --bucket scroogebank-crm-dev-transaction-sftp \
  --key incoming/transactions-2026-03.csv \
  --row-count 120 \
  --endpoint-url http://127.0.0.1:14566
```

**File Landing**: Files land directly in S3 bucket at `s3://<bucket>/incoming/<filename>`.

## Path 3: Filesystem Mock (Local Dev Only)

**Availability**: Local development only (when `TRANSACTION_SFTP_BUCKET` is not configured)

**Architecture**:
```
Local File → Transaction Service reads directly from MOCK_SFTP_ROOT
```

**Usage**:
```bash
# Place CSV files in mock directory
cp transactions.csv services/backend/transaction/mock-sftp/transactions.csv

# Call import API with filesystem path
curl -X POST http://localhost:8083/api/transactions/import \
  -H "Content-Type: application/json" \
  -d '{"sourcePath":"file:///app/mock-sftp/transactions.csv"}'
```

**File Landing**: Files read directly from filesystem (`MOCK_SFTP_ROOT` directory), no S3 upload.

## Common Import Flow (All Paths)

Once files land in S3 (or filesystem for local dev), the import flow is identical:

1. **Lambda Collector** (`sftp-transaction-collector`) runs on schedule (default: hourly)
2. Lambda scans S3 prefix `incoming/` for CSV files
3. Lambda calls `POST /api/transactions/import` with `{"sourcePath":"s3://<bucket>/<key>"}`
4. **Transaction Service** reads CSV from S3 (or filesystem if local)
5. Rows are validated and imported into transaction store (database)
6. Import results returned in API response

**Import API Contract**:
```http
POST /api/transactions/import
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "sourcePath": "s3://scroogebank-crm-dev-transaction-sftp/incoming/transactions-2026-03.csv"
}
```

**Response**:
```json
{
  "status": "success",
  "importedCount": 120,
  "skippedCount": 0,
  "errors": []
}
```

## Compatibility Notes

- Variable/property names retain `sftp` for backward compatibility:
  - `TRANSACTION_SFTP_BUCKET` (S3 bucket name)
  - `app.sftp.*` (application properties)
  - Terraform `transaction_sftp_*` (Terraform variables)
- These names refer to the S3 landing zone, not specifically to the SFTP transport method
- Transaction service is **transport-agnostic**: it reads from S3 regardless of how files arrived (SFTP, direct upload, etc.)

## Environment Configuration

| Environment | Transfer Family SFTP | Direct S3 Upload | Filesystem Mock |
|-------------|----------------------|------------------|-----------------|
| **lab** | Disabled (LabRole restrictions) | Enabled | N/A |
| **local** | Disabled (LocalStack limitation) | Enabled (via LocalStack) | Enabled |
| **integration** | **Enabled** (demo/testing) | Enabled | N/A |
| **prod** | **Enabled** (production) | Enabled | N/A |

## References

- Transfer Family Setup: [transfer-family-setup.md](../infrastructure/transfer-family-setup.md)
- Testing Guide: [TESTING-GUIDE.md](../testing/TESTING-GUIDE.md)
- Transaction Service README: [services/backend/transaction/README.md](../../services/backend/transaction/README.md)
- SFTP Collector README: [services/backend/sftp-transaction-collector/README.md](../../services/backend/sftp-transaction-collector/README.md)
