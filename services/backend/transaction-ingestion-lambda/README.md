# Transaction Ingestion Lambda

Scheduled Lambda that supports the Terraform pipeline:

EventBridge schedule -> Lambda -> mocked SFTP S3 bucket scan -> transaction import API call.

## Package artifact
- Terraform expects: `transaction-ingestion-lambda.zip`
- Default root Terraform variable:
  - `transaction_ingestion_lambda_zip_path = ../../services/backend/transaction-ingestion-lambda/transaction-ingestion-lambda.zip`

## Required environment variables
- `TRANSACTION_SFTP_BUCKET`
- `TRANSACTION_IMPORT_URL`

## Optional environment variables
- `TRANSACTION_SFTP_PREFIX` (default: `incoming/`)
- `TRANSACTION_IMPORT_AUTH_HEADER`
- `TRANSACTION_IMPORT_BEARER_TOKEN`
- `TRANSACTION_IMPORT_JWT_HMAC_SECRET`
- `TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN`
- `JWT_HMAC_SECRET_ARN` (fallback)
- `TRANSACTION_IMPORT_JWT_SUB` (default: `SYSTEM_TRANSACTION_INGESTION`)
- `TRANSACTION_IMPORT_JWT_ROLE` (default: `admin`)
- `TRANSACTION_IMPORT_JWT_TTL_SECONDS` (default: `300`)

## Behavior
- Selects the newest `.csv` object under `TRANSACTION_SFTP_PREFIX`.
- Calls `POST TRANSACTION_IMPORT_URL` with body:
  - `{"sourcePath":"s3://<bucket>/<s3-key>"}`
- Auth header resolution order:
  - `TRANSACTION_IMPORT_AUTH_HEADER`
  - `TRANSACTION_IMPORT_BEARER_TOKEN`
  - minted internal JWT from secret env/Secrets Manager

## Current integration limitation
- This lambda is still polling only one newest CSV object per run (not all newly uploaded CSV files).
