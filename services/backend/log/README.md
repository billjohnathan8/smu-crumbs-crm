# Log Service

## Overview
Python Lambda service for audit logs, AML alerts, and verification communication tracking.

## Responsibilities / Scope
- Persist and query audit log entries.
- Persist and review AML alerts.
- Persist and update communication records (including SES feedback status updates).
- Enforce client-scoped access for relevant reads.

## Key Endpoints or Interfaces
- OpenAPI: [../../../docs/api-contracts/openapi/log.yaml](../../../docs/api-contracts/openapi/log.yaml)
- Audit APIs: `/api/logs`, `/api/logs/{logId}`, `/api/clients/{clientId}/logs`
- AML APIs: `/api/aml/alerts`, `/api/aml/alerts/{alertId}`, `/api/aml/alerts/{alertId}/review`
- Communication APIs: `/api/communications`, `/api/communications/{communicationId}`, `/api/communications/provider/{providerMessageId}/status`
- Health: `GET /health`, `GET /api/v1/health`

Runtime interface:
- Lambda handler: `lambda_function.lambda_handler`

## Dependencies
- PostgreSQL (`DB_*` environment contract)
- JWT auth configuration (`AUTH_MODE`, `JWT_HMAC_SECRET` or Cognito settings)
- Optional downstream service calls (client-service URL)

Primary config references:
- [../../../docs/database_configuration.md](../../../docs/database_configuration.md)
- `services/backend/log/.env.example`

## Local Run / Test

From repo root:

```bash
python scripts/pipelines/test_backend.py --service log
```

From this directory:

```bash
python run-local-test-pipeline.py
```

Package Lambda zip (PowerShell):

```powershell
mkdir package
pip install -r requirements.txt -t package
Copy-Item lambda_function.py package\
Copy-Item -Recurse app package\app
Set-Location package
Compress-Archive -Path * -DestinationPath ..\log-lambda.zip -Force
```

## Notes
- Terraform in this repo expects `services/backend/log/log-lambda.zip` for zip-based deployment flows.
- Full integration topology invokes this service through Lambda-compatible paths (LocalStack/AWS), not as a long-running standalone HTTP server.
- Testing details: [../../../docs/testing/TESTING-GUIDE.md](../../../docs/testing/TESTING-GUIDE.md)
