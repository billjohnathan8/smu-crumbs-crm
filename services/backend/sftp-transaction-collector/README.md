# SFTP Transaction Collector

Scheduled Lambda that drives the official transaction ingestion path in deployed environments:

`EventBridge schedule -> Lambda -> S3 object selection -> POST /api/transactions/import`

This Lambda scans an S3 bucket for transaction CSV files. Files can arrive in S3 via:
- **AWS Transfer Family SFTP** (integration/prod) - Real SFTP protocol, files land in S3
- **Direct S3 upload** (all environments) - AWS CLI or SDK upload to S3
- The Lambda is transport-agnostic: it processes files regardless of how they arrived in S3

## Package Artifact

- Terraform artifact path:
  - `sftp-transaction-collector.zip`
- Root Terraform default:
  - `sftp_transaction_collector_zip_path = ../../services/backend/sftp-transaction-collector/sftp-transaction-collector.zip`

## Environment Variables

Required:
- `TRANSACTION_SFTP_BUCKET`: S3 bucket name scanned for CSV objects.
- `TRANSACTION_IMPORT_URL`: Full URL to `POST /api/transactions/import`.

Optional:
- `TRANSACTION_SFTP_PREFIX` (default: `incoming/`)
- `TRANSACTION_IMPORT_AUTH_HEADER`
- `TRANSACTION_IMPORT_BEARER_TOKEN`
- `TRANSACTION_IMPORT_JWT_HMAC_SECRET`
- `TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN`
- `JWT_HMAC_SECRET_ARN` (fallback for JWT minting)
- `TRANSACTION_IMPORT_JWT_SUB` (default: `SYSTEM_TRANSACTION_INGESTION`)
- `TRANSACTION_IMPORT_JWT_ROLE` (default: `admin`)
- `TRANSACTION_IMPORT_JWT_TTL_SECONDS` (default: `300`)

`TRANSACTION_SFTP_*` naming is legacy. The bucket serves as the S3 landing zone for all ingestion methods (SFTP, direct upload, etc.).

## Behavior

- Scans `s3://$TRANSACTION_SFTP_BUCKET/$TRANSACTION_SFTP_PREFIX`.
- Selects newest `.csv` object.
- Calls transaction import API with payload:
  - `{"sourcePath":"s3://<bucket>/<key>"}`
- Auth precedence:
  1. `TRANSACTION_IMPORT_AUTH_HEADER`
  2. `TRANSACTION_IMPORT_BEARER_TOKEN`
  3. Minted internal JWT from configured secret.

## Current Limitation

- Processes one newest CSV per run (not all new CSV files).

## AWS Transfer Family Integration

Files uploaded via AWS Transfer Family SFTP endpoint land in the same S3 bucket (`TRANSACTION_SFTP_BUCKET`) and are processed by this Lambda identically to direct S3 uploads.

**Setup**: See [docs/infrastructure/transfer-family-setup.md](../../../docs/infrastructure/transfer-family-setup.md)

**Contract**: See [docs/api-contracts/sftp-transaction-ingestion-contract.md](../../../docs/api-contracts/sftp-transaction-ingestion-contract.md)
