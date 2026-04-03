# Mock Transaction CSV Generator

This folder contains CSV fixtures for the transaction ingestion flow and a generator script:

- `mock_transactions.py`
- `mocked_transactions.csv`
- existing fixtures: `transactions.csv`, `transactions-2026-03.csv`

## Schema Used

The generator supports two output schemas:

- Legacy transaction import schema (default):
  `clientId,transaction,amount,date,status`
- AML schema:
  `transaction_id,client_id,transaction_type,amount,date,status`

Value contract:

- `clientId` / `client_id`: non-empty string
- `transaction` / `transaction_type`: `D` or `W`
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
  --end-date 2026-03-31 \
  --schema legacy
```

Optional:

- `--client-id-mode pool|sequential`
- `--client-ids clt_1,clt_2,...`
- `--client-id-count 20`
- `--schema legacy|aml`
- `--include-edge-cases` (appends a few invalid rows for negative testing)

AML-targeted file generation example:

```bash
python services/backend/transaction/mock-sftp/mock_transactions.py \
  --output services/backend/transaction/mock-sftp/mocked_transactions-aml.csv \
  --row-count 120 \
  --seed 301 \
  --start-date 2026-01-01 \
  --end-date 2026-03-31 \
  --schema aml
```

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

## AWS SFTP Upload (Integration/Prod)

For deployed environments, upload files via real SFTP endpoint with EC2:

### Prerequisites

1. Generate SSH key pair (run once):
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/crm-sftp-demo -N ""
   ```

2. Register public key in Terraform:
   ```bash
   export TF_VAR_sftp_user_ssh_public_key="$(cat ~/.ssh/crm-sftp-demo.pub)"
   ```

3. Deploy EC2 infrastructure:
   ```bash
   cd platform/terraform
   terraform apply -var-file=env/integration.tfvars
   ```

4. Retrieve SFTP endpoint:
   ```bash
   SFTP_ENDPOINT=$(terraform output -raw sftp_endpoint)
   SFTP_USERNAME=$(terraform output -raw sftp_username)
   ```

### Upload via SFTP

**Interactive session**:
```bash
sftp -i ~/.ssh/crm-sftp-demo crm-transaction-uploader@<sftp-endpoint>
put mocked_transactions.csv transactions-2026-03.csv
bye
```

**Using helper script**:
```bash
bash scripts/ci/upload-via-sftp.sh \
  --file ./mocked_transactions.csv \
  --sftp-endpoint "$SFTP_ENDPOINT" \
  --sftp-username "$SFTP_USERNAME" \
  --ssh-key ~/.ssh/crm-sftp-demo \
  --remote-filename transactions-2026-03.csv
```

Files uploaded via SFTP land in the same S3 bucket (`incoming/` prefix) where the Lambda collector picks them up.

### Documentation

- Setup guide: [docs/infrastructure/sftp-setup.md](../docs/infrastructure/sftp-setup.md)
- Ingestion contract: [docs/api-contracts/sftp-transaction-ingestion-contract.md](../docs/api-contracts/sftp-transaction-ingestion-contract.md)
