# SFTP Transaction Collector

## Overview
Scheduled Lambda that selects transaction CSV files from S3 and calls the transaction import API.

## Responsibilities / Scope
- Scan configured S3 prefix for transaction CSV files.
- Select newest CSV object per run.
- Call `POST /api/transactions/import` with an `s3://` source path.
- Authenticate request using explicit header/token or minted service JWT.

## Key Endpoints or Interfaces
- Trigger interface: `EventBridge schedule -> Lambda`
- Storage interface: `S3 list/get`
- Downstream API: `POST /api/transactions/import`
- Ingestion contract: [../../../docs/api-contracts/sftp-transaction-ingestion-contract.md](../../../docs/api-contracts/sftp-transaction-ingestion-contract.md)

## Dependencies
- `TRANSACTION_SFTP_BUCKET` (required)
- `TRANSACTION_IMPORT_URL` (required)
- Optional auth env vars (`TRANSACTION_IMPORT_AUTH_HEADER`, `TRANSACTION_IMPORT_BEARER_TOKEN`, JWT secret settings)
- Deployment artifact: `sftp-transaction-collector.zip`

## Local Run / Test

From this directory:

```bash
python run-local-test-pipeline.py
```

## Notes
- `TRANSACTION_SFTP_*` naming is legacy; the source is S3 regardless of upstream transport (SFTP or direct upload).
- Current behavior processes one newest CSV per run.
