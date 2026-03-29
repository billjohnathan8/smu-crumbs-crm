# Audit Consumer Lambda

SQS consumer Lambda for audit events. It validates incoming records and writes idempotent items to DynamoDB using conditional writes.

`SQS (audit-queue) -> Lambda -> validate/normalize -> DynamoDB PutItem (conditional) -> partial batch response`

## Package Artifact

- Terraform expects `audit-consumer-lambda.zip`
- Root Terraform default:
  - `audit_consumer_zip_path = ../../services/backend/audit-consumer/audit-consumer-lambda.zip`
- Build/update the zip from repo root (PowerShell):
  - `Compress-Archive -Path services/backend/audit-consumer/lambda_function.py -DestinationPath services/backend/audit-consumer/audit-consumer-lambda.zip -Force`

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
  "eventId": "evt-001",
  "occurredAt": "2026-02-03T10:20:30Z",
  "action": "UPDATE_PROFILE",
  "attributeName": "phone_number",
  "userId": "user-123",
  "clientId": "client-789",
  "sourceService": "profile-api"
}
```

Optional fields:
- `beforeValue` (any JSON type)
- `afterValue` (any JSON type)
- `correlationId` (string)
- `requestId` (string)
- `metadata` (object)

Validation notes:
- `occurredAt` must be valid ISO-8601.
- Naive timestamps are interpreted as UTC.
- `occurredAt` is normalized and stored in UTC `Z` format.

## DynamoDB Mapping

Core item shape:
- `pk = AUDIT#<eventId>`
- `sk = <normalized occurredAt>`
- `ttl = now + IDEMPOTENCY_TTL_DAYS`

Always written attributes:
- `event_id`
- `action`
- `attribute_name`
- `user_id`
- `client_id`
- `source_service`

Written only when present:
- `before_value`
- `after_value`
- `correlation_id`
- `request_id`
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

Run from `services/backend/audit-consumer`.

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

