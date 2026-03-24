# Verification Feedback Lambda

Consumes SES SNS feedback events and updates communication delivery status in the log service.

## Package artifact
- Terraform expects: `verification-lambda.zip`
- Default root Terraform variable:
  - `verification_zip_path = ../../services/backend/verification/verification-lambda.zip`
- Create/update the zip from repo root (PowerShell):
  - `Compress-Archive -Path services/backend/verification/lambda_function.py -DestinationPath services/backend/verification/verification-lambda.zip -Force`

## Required environment variables
- `LOG_API_BASE_URL`

## Optional authentication variables
- `VERIFICATION_LOG_AUTH_HEADER`
- `VERIFICATION_LOG_BEARER_TOKEN`
- `VERIFICATION_JWT_HMAC_SECRET`
- `VERIFICATION_JWT_HMAC_SECRET_ARN`
- `JWT_HMAC_SECRET_ARN` (fallback)
- `VERIFICATION_JWT_SUB` (default: `SYSTEM_VERIFICATION_FEEDBACK`)
- `VERIFICATION_JWT_ROLE` (default: `admin`)
- `VERIFICATION_JWT_TTL_SECONDS` (default: `300`)

## Behavior
- Parses SES SNS event payloads (`delivery`, `bounce`, `complaint`, `reject`).
- Calls:
  - `PATCH /api/communications/provider/{providerMessageId}/status`
- Maps events:
  - `DELIVERY|SEND` -> `sent`
  - `BOUNCE|COMPLAINT|REJECT` -> `failed`

## Notes
- Unknown/malformed SNS records are skipped and logged.
- Partial batch failures return HTTP 207-style status payload summary.
- In root Terraform, `enable_verification_pipeline=true` requires `enable_log_lambda=true` so `LOG_API_BASE_URL` is wired.
