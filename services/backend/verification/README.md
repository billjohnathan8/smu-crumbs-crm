# Verification Lambda

## Overview
SNS-triggered Lambda for verification email dispatch and SES feedback processing.

## Responsibilities / Scope
- Send verification email for `UPLOAD_VERIFICATION_REQUESTED` events.
- Process SES feedback events (`DELIVERY`, `BOUNCE`, `COMPLAINT`, `REJECT`).
- Update communication status through log-service provider status endpoint.

## Key Endpoints or Interfaces
- Event interfaces:
  - `SNS -> Lambda` (`UPLOAD_VERIFICATION_REQUESTED`)
  - `SES -> SNS -> Lambda` (delivery/complaint feedback)
- Downstream interface:
  - `PATCH /api/communications/provider/{providerMessageId}/status`
- Deployment artifact: `verification-lambda.zip`

Required runtime env by flow:
- Email send: `SES_SOURCE_EMAIL`, `FRONTEND_BASE_URL`
- Feedback updates: `LOG_API_BASE_URL` (+ optional auth/jwt vars)

## Dependencies
- AWS SES
- SNS topics/subscriptions
- Log API availability for feedback updates

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
- Verification token is minted upstream by client-service and passed in SNS message.
- Email expiry copy is derived from message `tokenTtlSeconds`.
- Root Terraform wiring for this pipeline depends on `enable_verification_pipeline`.
