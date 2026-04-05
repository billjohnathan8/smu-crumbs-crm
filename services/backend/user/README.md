# User Service

## Overview
Java 21 + Spring Boot service for CRM user identity, profile management, and authentication flows.

## Responsibilities / Scope
- Manage CRM users (create, update, disable, delete).
- Provide authentication and password-reset APIs.
- Emit audit events to log-service.

## Key Endpoints or Interfaces
- OpenAPI: [../../../docs/api-contracts/openapi/user.yaml](../../../docs/api-contracts/openapi/user.yaml)
- User APIs: `GET/POST/PUT/DELETE /api/users`, `GET /api/users/me`
- Auth APIs: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Health: `GET /health`, `GET /api/v1/health`

Test-only helper:
- `GET /api/test/password-reset/latest-token?email=...` is enabled only in `local`/`test` profiles.

## Dependencies
- PostgreSQL (`crm` / `crm_app`)
- Shared JWT secret (`JWT_HMAC_SECRET`)
- Log API (`LOG_SERVICE_URL`)

Primary config references:
- [../../../docs/database_configuration.md](../../../docs/database_configuration.md)
- `services/backend/user/.env.example`

## Local Run / Test

From repo root:

```bash
python scripts/pipelines/test_backend.py --service user
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
- In non-local/test profiles, the password-reset test helper route is blocked.
- For full-stack and integration workflows, prefer root scripts (`scripts/dev/stack-up.sh`, `scripts/pipelines/test_all.py`).
- Testing details: [../../../docs/testing/TESTING-GUIDE.md](../../../docs/testing/TESTING-GUIDE.md)
