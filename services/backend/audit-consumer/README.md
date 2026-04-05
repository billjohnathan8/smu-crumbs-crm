# Audit Consumer Lambda

## Overview
SQS consumer Lambda for audit events. It validates incoming payloads and writes idempotent records to DynamoDB.

## Responsibilities / Scope
- Consume batches from audit SQS queue.
- Validate and normalize audit events.
- Persist events with conditional writes to avoid duplicates.
- Return partial batch failures only for retryable persistence errors.

## Key Endpoints or Interfaces
- Event interface: `SQS -> Lambda`
- Persistence interface: `DynamoDB PutItem` with conditional expression
- Required payload fields: `eventId`, `occurredAt`, `action`, `attributeName`, `userId`, `clientId`, `sourceService`
- Optional fields include `beforeValue`, `afterValue`, `correlationId`, `requestId`, `metadata`

## Dependencies
- DynamoDB table (`DYNAMODB_TABLE_NAME`)
- Runtime env: `IDEMPOTENCY_TTL_DAYS`, `LOG_LEVEL`
- Deployment artifact: `audit-consumer-lambda.zip`

## Local Run / Test

From this directory:

```bash
python run-local-test-pipeline.py
```

Pipeline stages:
- `black --check`
- `flake8`
- `python -m compileall`
- `pytest` with coverage

## Notes
- Duplicate records are handled as success (idempotent behavior).
- Malformed events are acknowledged and not retried.
- Terraform default zip path points to this service artifact.
