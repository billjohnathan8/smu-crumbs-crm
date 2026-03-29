# Audit and AML Consumer Event Contracts

## Status

Active contract for the implemented async consumer Lambdas:

- `services/backend/audit-consumer/lambda_function.py`
- `services/backend/aml-consumer/lambda_function.py`

Runtime deployment remains feature-gated by Terraform flags:

- `enable_audit_pipeline`
- `enable_aml_pipeline`

## Transport

- Queue: Amazon SQS
- Envelope: standard Lambda SQS event (`Records[]`)
- Payload: JSON string in each `record.body`

## Audit Event Message

### Required fields

- `eventId` (string, globally unique)
- `occurredAt` (RFC3339 timestamp)
- `action` (string)
- `attributeName` (string)
- `userId` (string)
- `clientId` (string)
- `sourceService` (string)

### Optional fields

- `beforeValue` (string or object or null)
- `afterValue` (string or object or null)
- `correlationId` (string)
- `requestId` (string)
- `metadata` (object)

### Example

```json
{
  "eventId": "evt_audit_20260326_0001",
  "occurredAt": "2026-03-26T12:30:00Z",
  "action": "CREATE",
  "attributeName": "CLIENT",
  "beforeValue": null,
  "afterValue": {
    "clientId": "clt_123",
    "status": "active"
  },
  "userId": "usr_admin",
  "clientId": "clt_123",
  "correlationId": "req_abc123",
  "sourceService": "client-service",
  "requestId": "http_req_789",
  "metadata": {
    "channel": "api"
  }
}
```

## AML Report Event Message

### Required fields

- `alertId` (string, globally unique)
- `detectedAt` (RFC3339 timestamp)
- `clientId` (string)
- `alertType` (string)
- `description` (string)
- `reviewStatus` (string, default `Pending`)
- `entityId` (string)
- `sourceService` (string)

### Optional fields

- `transactionId` (string or null)
- `correlationId` (string)
- `riskScore` (number)
- `metadata` (object)

### Example

```json
{
  "alertId": "aml_20260326_0001",
  "detectedAt": "2026-03-26T12:35:00Z",
  "clientId": "clt_123",
  "transactionId": "txn_987",
  "alertType": "STRUCTURING",
  "description": "Rapid deposits below threshold within 7-day window.",
  "reviewStatus": "Pending",
  "entityId": "sg",
  "correlationId": "run_456",
  "sourceService": "aml-lambda",
  "riskScore": 0.91,
  "metadata": {
    "windowDays": 7
  }
}
```

## Validation Rules

Apply validation per message before writing to DynamoDB:

- required field presence
- type checks
- timestamp parseable as RFC3339
- ids are non-empty strings
- `reviewStatus` in allowed set (`Pending`, `Confirmed`, `FalsePositive`)

Invalid messages should be treated as non-retryable and excluded from `batchItemFailures`.

## Idempotency Keys

- Audit: `eventId`
- AML: `alertId`

Recommended write policy:

- conditional put with `attribute_not_exists(pk)`
- duplicate messages treated as success/no-op

## Backward Compatibility

During migration from synchronous HTTP logging:

- producers may continue direct HTTP writes
- async event publish can be introduced incrementally per service
- consumers should tolerate unknown extra fields in payloads
