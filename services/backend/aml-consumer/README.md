# AML Consumer Lambda

## Overview
SQS consumer Lambda for AML alerts. It validates message payloads and writes idempotent records to DynamoDB.

## Responsibilities / Scope
- Consume batches from AML SQS queue.
- Validate/normalize alert payloads.
- Persist idempotent items with conditional writes.
- Return partial batch failures for retryable records only.

## Key Endpoints or Interfaces
- Event interface: `SQS -> Lambda`
- Persistence interface: `DynamoDB PutItem` with conditional expression
- Required payload fields: `alertId`, `detectedAt`, `clientId`, `alertType`, `description`, `reviewStatus`, `entityId`, `sourceService`
- Review status enum: `Pending`, `Confirmed`, `FalsePositive`

## Dependencies
- DynamoDB table (`DYNAMODB_TABLE_NAME`)
- Runtime env: `IDEMPOTENCY_TTL_DAYS`, `LOG_LEVEL`
- Deployment artifact: `aml-consumer-lambda.zip`

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
- Duplicate records (same PK/SK) are treated as success (idempotent).
- Malformed records are acknowledged and not retried.
- Terraform default zip path points to this service artifact.
