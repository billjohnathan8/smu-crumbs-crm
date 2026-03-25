# Verification Lambda

Dual-purpose Lambda subscribed to SNS. Handles two distinct event flows:

## Flows

### 1. Upload Verification email (`UPLOAD_VERIFICATION_REQUESTED`)
Triggered when a client is created in the backend.
```
Java createClient → SNS publish → Lambda → SES send_email → User inbox
                                        ↓
                              Signed token + frontend link
                                        ↓
                              User clicks → /verify-client?clientId=...&token=...
```

### 2. SES delivery feedback (`DELIVERY` / `BOUNCE` / `COMPLAINT` / `REJECT`)
Triggered by SES notification events forwarded via SNS.
```
SES event → SNS → Lambda → PATCH /api/communications/provider/{id}/status
```

---

## Package artifact
- Terraform expects: `verification-lambda.zip`
- Default root Terraform variable:
  - `verification_zip_path = ../../services/backend/verification/verification-lambda.zip`
- Create/update the zip from repo root (PowerShell):
  - `Compress-Archive -Path services/backend/verification/lambda_function.py -DestinationPath services/backend/verification/verification-lambda.zip -Force`

---

## Environment variables

### Flow 1 — sending verification emails
| Variable | Required | Description |
|---|---|---|
| `SES_SOURCE_EMAIL` | ✅ | Verified SES sender address |
| `FRONTEND_BASE_URL` | ✅ | e.g. `https://app.example.com` |
| `VERIFICATION_JWT_HMAC_SECRET` | Recommended | Signs verification tokens |
| `VERIFICATION_JWT_HMAC_SECRET_ARN` | Alt | Secrets Manager ARN for signing secret |

### Flow 2 — SES feedback logging
| Variable | Required | Description |
|---|---|---|
| `LOG_API_BASE_URL` | ✅ | Base URL for log API |
| `VERIFICATION_LOG_AUTH_HEADER` | Optional | Full `Authorization` header |
| `VERIFICATION_LOG_BEARER_TOKEN` | Optional | Bearer token fallback |
| `VERIFICATION_JWT_HMAC_SECRET_ARN` | Optional | Secrets Manager ARN for service JWT |
| `JWT_HMAC_SECRET_ARN` | Optional | Fallback secret ARN |
| `VERIFICATION_JWT_SUB` | Optional | JWT subject (default: `SYSTEM_VERIFICATION_FEEDBACK`) |
| `VERIFICATION_JWT_ROLE` | Optional | JWT role (default: `admin`) |
| `VERIFICATION_JWT_TTL_SECONDS` | Optional | Token TTL in seconds (default: `300`) |

---

## SNS message shape — `UPLOAD_VERIFICATION_REQUESTED`

Your Java `snsEmailPublisher.publishVerificationEmail(...)` must publish this JSON:
```json
{
  "eventType": "UPLOAD_VERIFICATION_REQUESTED",
  "clientId": "client_abc123",
  "email": "user@example.com",
  "firstName": "Jane",
  "requestId": "req_xyz"
}
```

---

## Event routing summary

| `eventType` field | Handler |
|---|---|
| `UPLOAD_VERIFICATION_REQUESTED` | Sends SES email with signed frontend link |
| `DELIVERY`, `SEND` | Updates log service → `sent` |
| `BOUNCE`, `COMPLAINT`, `REJECT` | Updates log service → `failed` |
| anything else | Updates log service → `queued` |

---

## Notes
- If `VERIFICATION_JWT_HMAC_SECRET` is not set, tokens are unsigned random bytes — **set this in production**.
- Verification links expire after **24 hours** by default.
- Unknown/malformed SNS records are skipped and logged.
- Partial batch failures return a `207` status payload with per-record detail.
- In root Terraform, `enable_verification_pipeline=true` requires `enable_log_lambda=true` so `LOG_API_BASE_URL` is wired.
