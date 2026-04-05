# Client Service

## Overview
Java 21 + Spring Boot service for CRM client lifecycle, verification document intake, and verification workflow orchestration.

## Responsibilities / Scope
- Manage client entities (`/api/clients`).
- Accept tokenized verification document uploads.
- Publish verification-email requests to SNS during client creation.
- Emit audit/communication records through log-service integration.

## Key Endpoints or Interfaces
- OpenAPI: [../../../docs/api-contracts/openapi/client.yaml](../../../docs/api-contracts/openapi/client.yaml)
- Core APIs: `GET/POST/PUT/DELETE /api/clients`, `GET /api/clients/{id}`
- Verification APIs: `POST /api/clients/{id}/upload-verify`, `PATCH /api/clients/{id}/verify/review`
- Health: `GET /health`, `GET /api/v1/health`

Verification email path (canonical):
1. `POST /api/clients` mints verification token.
2. Publishes `UPLOAD_VERIFICATION_REQUESTED` to SNS.
3. `services/backend/verification` Lambda sends SES email.

## Dependencies
- PostgreSQL (`crm` / `crm_app`)
- Log API (`CLIENT_LOG_SERVICE_URL` / `LOG_SERVICE_URL` fallback)
- SNS topic (`VERIFICATION_SNS_TOPIC_ARN`)
- S3 bucket for verification docs (`VERIFICATION_DOCUMENTS_BUCKET`)

Primary config references:
- [../../../docs/database_configuration.md](../../../docs/database_configuration.md)
- `services/backend/client/.env.example`

## Local Run / Test

From repo root:

```bash
python scripts/pipelines/test_backend.py --service client
```

From this directory:

```bash
./gradlew localTestPipeline
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Windows equivalents:

```powershell
.\gradlew.bat localTestPipeline
.\gradlew.bat bootRun --args='--spring.profiles.active=dev'
```

## Notes
- Canonical verification dispatch is SNS/Lambda-driven; legacy queued worker stays off unless explicitly enabled.
- If SNS publish fails during create-client, the request should fail closed.
- Testing details: [../../../docs/testing/TESTING-GUIDE.md](../../../docs/testing/TESTING-GUIDE.md)
