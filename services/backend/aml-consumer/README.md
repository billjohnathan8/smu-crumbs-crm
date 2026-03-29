# AML Consumer Lambda

SQS consumer Lambda for AML alerts. It validates incoming records and writes idempotent items to DynamoDB using conditional writes.

`SQS (aml-queue) -> Lambda -> validate/normalize -> DynamoDB PutItem (conditional) -> partial batch response`

## Package Artifact

- Terraform expects `aml-consumer-lambda.zip`
- Root Terraform default:
  - `aml_consumer_zip_path = ../../services/backend/aml-consumer/aml-consumer-lambda.zip`
- Build/update the zip from repo root (PowerShell):
  - `Compress-Archive -Path services/backend/aml-consumer/lambda_function.py -DestinationPath services/backend/aml-consumer/aml-consumer-lambda.zip -Force`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DYNAMODB_TABLE_NAME` | Yes | Target table name. If missing, all messages in the batch are returned as retryable failures. |
| `IDEMPOTENCY_TTL_DAYS` | No | TTL window in days for stored items. Default: `90`. Invalid or non-positive values fall back to `90`. |
| `LOG_LEVEL` | No | Python logger level. Default: `INFO`. |

## SQS Message Body Contract

Required fields:

```json
{
  "alertId": "aml-001",
  "detectedAt": "2026-02-03T10:20:30Z",
  "clientId": "client-789",
  "alertType": "LargeCashDeposit",
  "description": "Large cash deposit in 24h window",
  "reviewStatus": "Pending",
  "entityId": "entity-123",
  "sourceService": "aml-engine"
}
```

Optional fields:
- `transactionId` (string)
- `correlationId` (string)
- `riskScore` (number)
- `metadata` (object)

Validation notes:
- `reviewStatus` must be one of `Pending`, `Confirmed`, `FalsePositive`.
- `detectedAt` must be valid ISO-8601.
- Naive timestamps are interpreted as UTC.
- `detectedAt` is normalized and stored in UTC `Z` format.

## DynamoDB Mapping

Core item shape:
- `pk = AML#<alertId>`
- `sk = <normalized detectedAt>`
- `ttl = now + IDEMPOTENCY_TTL_DAYS`

Always written attributes:
- `alert_id`
- `client_id`
- `alert_type`
- `description`
- `review_status`
- `entity_id`
- `source_service`

Written only when present:
- `transaction_id`
- `correlation_id`
- `risk_score`
- `metadata`

Write condition:
- `attribute_not_exists(pk) AND attribute_not_exists(sk)`

## Batch Failure Behavior

- Successful writes are acknowledged.
- Conditional-write duplicates are treated as successful (idempotent).
- Malformed/invalid payloads are non-retryable and acknowledged.
- Retryable persistence errors return `{"itemIdentifier":"<messageId>"}` in `batchItemFailures`.
- The Lambda is configured for SQS partial batch response (`ReportBatchItemFailures`).

## Local Test Pipeline

Run from `services/backend/aml-consumer`.

Windows:
```powershell
python run-local-test-pipeline.py
```

macOS/Linux:
```bash
python3 run-local-test-pipeline.py
```

Alternative wrappers:
- `run-local-test-pipeline.cmd`
- `run-local-test-pipeline.sh`

Pipeline steps:
1. `black --check`
2. `flake8`
3. `python -m compileall`
4. `pytest` with coverage

Reports:
- `build/reports/tests/junit.xml`
- `build/reports/coverage/coverage.xml`
- `build/reports/coverage/html/index.html`

