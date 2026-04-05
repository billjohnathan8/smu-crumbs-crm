# Transaction Service

## Overview
Java 21 + Spring Boot service for transaction CRUD and CSV import processing.

## Responsibilities / Scope
- Provide transaction APIs for CRUD and query.
- Import transactions from CSV via `POST /api/transactions/import`.
- Resolve import sources from S3 or local mock filesystem.
- Optionally poll configured sources on a scheduler.

## Key Endpoints or Interfaces
- OpenAPI: [../../../docs/api-contracts/openapi/transaction.yaml](../../../docs/api-contracts/openapi/transaction.yaml)
- Core APIs: `GET/POST /api/transactions`, `GET/PUT/DELETE /api/transactions/{transactionId}`
- Client-scoped list: `GET /api/clients/{clientId}/transactions`
- Import APIs: `POST /api/transactions/import`, `GET /api/transactions/imports/{importBatchId}`
- Health: `GET /health`, `GET /api/v1/health`

Ingestion contract:
- [../../../docs/api-contracts/sftp-transaction-ingestion-contract.md](../../../docs/api-contracts/sftp-transaction-ingestion-contract.md)

## Dependencies
- PostgreSQL (`crm` / `crm_app`)
- Optional S3 source (`TRANSACTION_IMPORT_S3_BUCKET`)
- Optional local filesystem source (`MOCK_SFTP_ROOT`)

Primary config references:
- [../../../docs/database_configuration.md](../../../docs/database_configuration.md)
- `services/backend/transaction/.env.example`

## Local Run / Test

From repo root:

```bash
python scripts/pipelines/test_backend.py --service transaction
```

From this directory:

```bash
./gradlew localTestPipeline
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Windows equivalents:

```powershell
.\gradlew.bat localTestPipeline
.\gradlew.bat bootRun --args='--spring.profiles.active=dev'
```

## Notes
- `sourcePath` may be absolute S3 (`s3://bucket/key`), bucket-relative key, or local file path (when S3 bucket is unset).
- Local development can use filesystem mock ingestion; deployed environments typically use S3-backed ingestion through collector Lambda.
- CSV header contract: `clientId,transaction,amount,date,status`.
