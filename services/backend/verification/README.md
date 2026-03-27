# Verification Lambda

SNS-triggered Lambda with two responsibilities:

## Flows

### 1. Verification email send (`UPLOAD_VERIFICATION_REQUESTED`)
Triggered by client-service when a client is created.

```
client-service createClient -> SNS publish -> Lambda -> SES send_email -> user inbox
                                                |
                                                -> link: /verify-client?clientId=...&token=...
```

Important:
- This Lambda does not mint customer verification tokens.
- Token is generated upstream by client-service and passed in SNS message.

### 2. SES feedback processing (`DELIVERY` / `BOUNCE` / `COMPLAINT` / `REJECT`)
Triggered by SES notifications forwarded through SNS.

```
SES event -> SNS -> Lambda -> PATCH /api/communications/provider/{id}/status
```

---

## Package Artifact
- Terraform expects: `verification-lambda.zip`
- Root Terraform default:
  - `verification_zip_path = ../../services/backend/verification/verification-lambda.zip`
- Build zip from repo root (PowerShell):
  - `Compress-Archive -Path services/backend/verification/lambda_function.py -DestinationPath services/backend/verification/verification-lambda.zip -Force`

---

## Environment Variables

### Flow 1 (email send)
| Variable | Required | Description |
|---|---|---|
| `SES_SOURCE_EMAIL` | Yes | Verified SES sender address |
| `FRONTEND_BASE_URL` | Yes | Public frontend base URL (for `/verify-client` link) |

### Flow 2 (feedback updates)
| Variable | Required | Description |
|---|---|---|
| `LOG_API_BASE_URL` | Yes (for feedback path) | Base URL for log API |
| `VERIFICATION_LOG_AUTH_HEADER` | Optional | Full Authorization header |
| `VERIFICATION_LOG_BEARER_TOKEN` | Optional | Bearer token fallback |
| `VERIFICATION_JWT_HMAC_SECRET` | Optional | Inline secret for minting service JWT when no explicit header/token is set |
| `VERIFICATION_JWT_HMAC_SECRET_ARN` | Optional | Secrets Manager ARN for service JWT secret |
| `JWT_HMAC_SECRET_ARN` | Optional | Fallback secret ARN |
| `VERIFICATION_JWT_SUB` | Optional | Service JWT subject (default: `SYSTEM_VERIFICATION_FEEDBACK`) |
| `VERIFICATION_JWT_ROLE` | Optional | Service JWT role (default: `admin`) |
| `VERIFICATION_JWT_TTL_SECONDS` | Optional | Service JWT TTL seconds (default: `300`) |

---

## SNS Message Shape (`UPLOAD_VERIFICATION_REQUESTED`)

Expected JSON payload from client-service publisher:

```json
{
  "eventType": "UPLOAD_VERIFICATION_REQUESTED",
  "clientId": "clt_abc123",
  "email": "user@example.com",
  "firstName": "Jane",
  "token": "<verification-token>",
  "requestId": "req_xyz",
  "tokenTtlSeconds": 7200
}
```

---

## Notes
- Customer token TTL is supplied by client-service in `tokenTtlSeconds` (default `7200` / 2 hours).
- Email expiry copy is rendered from `tokenTtlSeconds`, so the message and token validity stay aligned.
- Unknown/malformed SNS records are skipped and logged.
- Partial batch failures return `207` with per-record failure details.
- In root Terraform, `enable_verification_pipeline=true` requires `enable_log_lambda=true` so `LOG_API_BASE_URL` is wired.
