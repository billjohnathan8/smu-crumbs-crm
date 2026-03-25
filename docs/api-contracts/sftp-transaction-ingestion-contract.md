# Transaction Ingestion Contract

## Official Supported Path

The official transaction ingestion path for this repository is:

1. Source files are dropped in an S3 bucket (mock ingestion transport).
2. Scheduled `sftp-transaction-collector` Lambda scans the bucket and selects a CSV object.
3. Lambda calls `POST /api/transactions/import` with `{"sourcePath":"s3://<bucket>/<key>"}`.
4. Transaction service reads the S3 object and imports rows into its transaction store.

## Local Development Variant

For local-only development, the same import API can read CSV files from
`MOCK_SFTP_ROOT` (filesystem mock source) when S3 import bucket is not configured.

## Explicitly Out of Scope

- Real network SFTP host/user/password/private-key ingestion is not implemented.
- Placeholder SFTP client abstractions were removed to avoid false completeness.

## Compatibility Notes

- Some variable/property names retain `sftp` for backward compatibility
  (`TRANSACTION_SFTP_BUCKET`, `app.sftp.*`, Terraform `transaction_sftp_*`).
- These names refer to the S3-backed mock ingestion flow, not a real SFTP transport.
