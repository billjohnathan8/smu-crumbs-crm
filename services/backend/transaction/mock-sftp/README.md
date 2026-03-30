# Mock Transaction CSV Generator

This folder contains CSV fixtures for the transaction ingestion flow and a generator script:

- `mock_transactions.py`
- `mocked_transactions.csv`
- existing fixtures: `transactions.csv`, `transactions-2026-03.csv`

## Schema Used

The generator intentionally outputs only the active ingestion contract columns:

`clientId,transaction,amount,date,status`

Value contract:

- `clientId`: non-empty string
- `transaction`: `D` or `W`
- `amount`: decimal string with 2 d.p., non-negative
- `date`: `YYYY-MM-DD`
- `status`: `Completed` | `Pending` | `Failed`

## Source of Truth in Repo

Contract was aligned to these active paths:

- `docs/api-contracts/sftp-transaction-ingestion-contract.md`
- `docs/api-contracts/openapi/transaction.yaml`
- `services/backend/transaction/src/main/java/.../service/imports/TransactionCsvParser.java`
- `services/backend/transaction/src/main/java/.../service/imports/S3BackedTransactionFileSource.java`
- `services/backend/sftp-transaction-collector/lambda_function.py`
- `scripts/ci/run-fullstack-integration-e2e.sh`

## Regenerate CSV

From repository root:

```bash
python services/backend/transaction/mock-sftp/mock_transactions.py \
  --output services/backend/transaction/mock-sftp/mocked_transactions.csv \
  --row-count 120 \
  --seed 301 \
  --start-transaction-id 1000 \
  --start-date 2026-01-01 \
  --end-date 2026-03-31
```

Optional:

- `--client-id-mode pool|sequential`
- `--client-ids clt_1,clt_2,...`
- `--client-id-count 20`
- `--include-edge-cases` (appends a few invalid rows for negative testing)

## Where to Use the File

Local filesystem import (transaction service):

- place under `services/backend/transaction/mock-sftp/`
- call `POST /api/transactions/import` with:
  - `{"sourcePath":"mocked_transactions.csv"}`
  - or copy/rename to `transactions.csv` if relying on default source path

S3 / LocalStack import:

- upload to ingestion bucket used by your env (for LocalStack CI examples: `scroogebank-crm-dev-transaction-sftp`)
- supported key patterns already used by repo scripts:
  - manual import: `manual/<file>.csv`
  - scheduled poll import: `scheduled/<file>.csv`
  - collector lambda scan prefix: `incoming/<file>.csv`

## Scripted Seeding (LocalStack / AWS dev-staging)

Use the repo helper script to generate and upload in one command:

```bash
bash scripts/ci/seed-transaction-fixture.sh \
  --environment local \
  --bucket scroogebank-crm-dev-transaction-sftp \
  --key manual/mocked-transactions.csv \
  --output services/backend/transaction/mock-sftp/mocked_transactions.csv
```

Optional import trigger:

```bash
bash scripts/ci/seed-transaction-fixture.sh \
  --environment local \
  --bucket scroogebank-crm-dev-transaction-sftp \
  --key manual/mocked-transactions.csv \
  --trigger-import-url http://127.0.0.1:18083/api/transactions/import \
  --auth-token "<admin-jwt>"
```

Safety:

- Script blocks `--environment prod` unless `--allow-prod` is explicitly passed.
- Intended for local/dev/staging fixture seeding only.
