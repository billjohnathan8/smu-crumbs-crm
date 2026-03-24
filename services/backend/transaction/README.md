# Transaction Service

## Overview
- Provides transaction import and listing APIs.
- Uses one ingestion contract:
  - local filesystem mock files (`mock-sftp/*.csv`) for local development
  - S3-backed mock ingestion for CI/deployed environments
- Does not implement a real network SFTP client.

## Official Ingestion Contract

The only supported ingestion transport is:
1. `POST /api/transactions/import` reads CSV from either:
   - local path relative to `MOCK_SFTP_ROOT`, or
   - explicit `s3://bucket/key`, or
   - configured S3 default bucket (`TRANSACTION_IMPORT_S3_BUCKET`) + relative key.
2. Optional polling scheduler (`TRANSACTION_SFTP_POLL_ENABLED=true`) lists CSV files and calls the same import API internally.
3. In Terraform-managed environments, the scheduled `transaction-ingestion` Lambda selects a CSV object from S3 and calls this API with `sourcePath=s3://...`.

Not supported:
- Real SFTP host/user/password/private-key transport.

## Source Resolution Rules

- `sourcePath = s3://bucket/key`:
  - always read from that S3 object.
- `sourcePath = incoming/file.csv` and `TRANSACTION_IMPORT_S3_BUCKET` configured:
  - read `s3://<TRANSACTION_IMPORT_S3_BUCKET>/incoming/file.csv`.
- `sourcePath = transactions.csv` and no S3 bucket configured:
  - read from `${MOCK_SFTP_ROOT}/transactions.csv`.
- Empty or missing `sourcePath`:
  - defaults to `transactions.csv`.

## CSV Contract

- Header: `clientId,transaction,amount,date,status`
- `transaction`: `D` or `W`
- `status`: `Completed`, `Pending`, `Failed`
- Duplicate rows are deduplicated by deterministic SHA-256 key.

## Runtime Variables

- `MOCK_SFTP_ROOT` (default `./mock-sftp`)
- `TRANSACTION_SFTP_REMOTE_DIR` (scheduler list prefix/directory)
- `TRANSACTION_SFTP_POLL_ENABLED` (default `false`)
- `TRANSACTION_SFTP_POLL_FIXED_DELAY_MS`
- `TRANSACTION_SFTP_POLL_INITIAL_DELAY_MS`
- `TRANSACTION_IMPORT_S3_BUCKET`
- `TRANSACTION_IMPORT_S3_REGION` (default `ap-southeast-1`)
- `TRANSACTION_IMPORT_S3_ENDPOINT` (for LocalStack)
- `TRANSACTION_IMPORT_S3_PATH_STYLE_ACCESS_ENABLED`
- `TRANSACTION_IMPORT_S3_ACCESS_KEY_ID`
- `TRANSACTION_IMPORT_S3_SECRET_ACCESS_KEY`

## Local Run

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Sample local env:

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/crm
export SPRING_DATASOURCE_USERNAME=crm_app
export SPRING_DATASOURCE_PASSWORD=devpassword
export APP_TRANSACTIONS_STORE_TYPE=postgres
export MOCK_SFTP_ROOT=./mock-sftp
export TRANSACTION_SFTP_REMOTE_DIR=.
export TRANSACTION_SFTP_POLL_ENABLED=true
export TRANSACTION_SFTP_POLL_FIXED_DELAY_MS=30000
export TRANSACTION_SFTP_POLL_INITIAL_DELAY_MS=5000
```

## Local Test Pipeline

Windows:
```powershell
.\gradlew.bat localTestPipeline
```

macOS/Linux:
```bash
./gradlew localTestPipeline
```

Runs:
1. Checkstyle
2. Build
3. Unit tests
4. JaCoCo report

## OpenAPI

- `../../../docs/api-contracts/openapi/transaction.yaml`
