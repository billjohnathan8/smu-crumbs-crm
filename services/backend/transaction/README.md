# Transaction Service

## Overview
- Provides full transaction CRUD and import APIs.
- Supports multiple ingestion paths (all converge to S3 or filesystem):
  - **EC2** (integration/prod): SFTP endpoint → S3 landing zone
  - **Direct S3 upload** (all environments): AWS CLI/SDK → S3 landing zone
  - **Filesystem mock** (local dev): Direct file read from `MOCK_SFTP_ROOT`
- Transaction service is **transport-agnostic**: reads from S3 or filesystem, regardless of how files arrived

## API Contract

**OpenAPI Specification:** [`docs/api-contracts/openapi/transaction.yaml`](../../../docs/api-contracts/openapi/transaction.yaml)

**Transaction endpoints:**
- `GET /api/transactions` - List transactions (filterable by `clientId`, `status`, `transaction`, `fromDate`, `toDate`)
- `POST /api/transactions` - Create transaction (admin only)
- `GET /api/transactions/{transactionId}` - Get transaction by ID
- `PUT /api/transactions/{transactionId}` - Update transaction (admin only)
- `DELETE /api/transactions/{transactionId}` - Delete transaction (admin only)
- `GET /api/clients/{clientId}/transactions` - List transactions for a specific client
- `POST /api/transactions/import` - Import transactions from CSV source (admin only)
- `GET /api/transactions/imports/{importBatchId}` - Get import batch status (admin only)

**Health endpoints:**
- `GET /health` - Primary health check
- `GET /api/v1/health` - Legacy health endpoint

## Official Ingestion Contract

**Import Flow**:
1. Files arrive in S3 bucket via:
   - **EC2** (integration/prod): EC2 → files land in S3
   - **Direct S3 upload** (all environments): AWS CLI/SDK → S3
   - **Filesystem** (local dev only): Files placed in `MOCK_SFTP_ROOT`
2. Scheduled `sftp-transaction-collector` Lambda scans S3 prefix for CSV files
3. Lambda calls `POST /api/transactions/import` with `{"sourcePath":"s3://bucket/key"}`
4. Transaction service reads CSV from S3 (or filesystem if local) and imports rows

**Transaction Service Responsibilities**:
- `POST /api/transactions/import` reads CSV from:
  - Explicit `s3://bucket/key`, or
  - Relative key + `TRANSACTION_IMPORT_S3_BUCKET`, or
  - Local path relative to `MOCK_SFTP_ROOT` (local dev only)
- Optional polling scheduler (`TRANSACTION_SFTP_POLL_ENABLED=true`) can list and auto-import CSV files

**Documentation**:
- Full ingestion contract: [docs/api-contracts/sftp-transaction-ingestion-contract.md](../../../docs/api-contracts/sftp-transaction-ingestion-contract.md)

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
export SPRING_DATASOURCE_PASSWORD="$LOCAL_DB_PASSWORD"
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
