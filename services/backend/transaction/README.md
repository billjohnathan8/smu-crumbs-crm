# Transaction Service

## Overview
- Provides transaction import and listing APIs used by the backend.
- Supports manual and scheduled transaction ingestion from an S3-backed source.
- Local mock transaction CSV files live at `mock-sftp/*.csv`.

## Transaction Ingestion — S3-Backed Mock SFTP

The project's SFTP requirement is intentionally satisfied by an S3-backed mock.
**No real SFTP network client is used.** This design choice is deliberate:
the course requirement for SFTP ingestion is met by treating an S3 bucket as the
file-drop transport, which is functionally equivalent and avoids unnecessary
network complexity.

### How it works

The ingestion layer uses a `TransactionFileSource` abstraction
(implemented by `S3BackedTransactionFileSource`):

| Mode | When | Source |
|------|------|--------|
| **Filesystem** | Local dev (`MOCK_SFTP_ROOT`) | CSV files on local disk |
| **S3** | Deployed / CI (`TRANSACTION_IMPORT_S3_*`) | S3 bucket objects |

- Explicit `s3://bucket/key` source paths are always resolved against S3.
- When an S3 bucket is configured it takes precedence for listing operations.

### Ingestion behavior
- Imports parse CSV rows with quoted-field support.
- Rows are validated against the 5-field transaction model:
  - `clientId,transaction,amount,date,status`
- Duplicate rows are skipped using a deterministic SHA-256 dedupe key.
- Re-running the same import does not create duplicate transactions.

### Scheduler
- Enable periodic polling with:
  - `TRANSACTION_SFTP_POLL_ENABLED=true`
- Scheduler reads all `*.csv` files under `TRANSACTION_SFTP_REMOTE_DIR` (default `.`):
  - filesystem mode returns paths relative to `MOCK_SFTP_ROOT`
  - S3 mode returns `s3://...` object paths
- Poll cadence is configurable:
  - `TRANSACTION_SFTP_POLL_FIXED_DELAY_MS`
  - `TRANSACTION_SFTP_POLL_INITIAL_DELAY_MS`

### Implementation summary
- `TransactionFileSource` interface — abstraction for CSV file listing/reading.
- `S3BackedTransactionFileSource` — reads from local filesystem or S3 bucket.
- `TransactionCsvParser` — quoted-field CSV parsing, 5-column validation, dedupe key generation.
- `TransactionImportScheduler` (`@Scheduled`) — periodic polling/import.
- Idempotent import via persisted dedupe key (`import_dedupe_key`) with migration `V2__add_import_dedupe_key.sql`.
- Sample CSV: `mock-sftp/transactions-2026-03.csv`.

## Running Locally

Use the explicit dev profile for local convenience defaults:

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Sample env config:

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
export TRANSACTION_IMPORT_S3_BUCKET=
export TRANSACTION_IMPORT_S3_REGION=ap-southeast-1
export TRANSACTION_IMPORT_S3_ENDPOINT=
export TRANSACTION_IMPORT_S3_PATH_STYLE_ACCESS_ENABLED=false
export TRANSACTION_IMPORT_S3_ACCESS_KEY_ID=
export TRANSACTION_IMPORT_S3_SECRET_ACCESS_KEY=
```

Or copy values from `.env.example` (`services/backend/transaction/.env.example`).
For environment boundaries across local/test/CI/prod, see [Configuration Guide](../../../docs/configuration.md).

Start local infra:

```bash
docker compose -f ../../../docker-compose.localstack.yml up -d
```

Trigger and verify ingestion:
1. Manual import:
   - `POST /api/transactions/import`
2. Scheduled import:
   - keep `TRANSACTION_SFTP_POLL_ENABLED=true` and wait for the poll cycle
3. Verify imported records:
   - `GET /api/transactions`
   - or `GET /api/clients/{clientId}/transactions`

Security note:
- Production must provide `JWT_HMAC_SECRET` via environment/secrets.

## Known limitations
- Dedupe is field-based. Legitimate transactions with identical values across all dedupe fields are treated as duplicates.
- `POST /api/transactions/import` still responds `202 Accepted` while import executes synchronously.

## OpenAPI contract
- `../../../docs/api-contracts/openapi/transaction.yaml`

## Local test pipeline (service root)

Windows:
```powershell
.\gradlew.bat localTestPipeline
```

macOS/Linux:
```bash
./gradlew localTestPipeline
```

This one-liner runs:
1. Checkstyle lint (`checkstyleMain`, `checkstyleTest`)
2. Build (`assemble`)
3. Tests (JUnit + Mockito via `test`)
4. Coverage report generation (`jacocoTestReport`)

Reports:
- `build/reports/checkstyle/main.html`
- `build/reports/checkstyle/test.html`
- `build/reports/tests/test/index.html`
- `build/reports/jacoco/test/html/index.html`