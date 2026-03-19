# Log Service Audit: Lambda vs FastAPI (2026-03-19)

## Scope
Audit target: `services/backend/log` and repository-wide integration points that consume or provision the log API.

Primary questions:
1. How the log service currently works, especially as Lambda.
2. Whether it is "actually" a Lambda function.
3. What must change to refactor it into a true direct Lambda handler (no FastAPI/Mangum), and what else in the repo is affected.

## Executive Summary
- The log service is deployed and invoked as an AWS Lambda function today (`lambda_function.lambda_handler`), so yes, it is a Lambda runtime.
- It is not a native/direct Lambda HTTP router. It is a FastAPI ASGI app wrapped by Mangum.
- Request handling, validation, error shaping, middleware behavior, and route dispatch are currently provided by FastAPI; Lambda is currently the host runtime and Mangum is the adapter.
- A true Lambda refactor can keep all external API paths and payloads stable, but requires replacing framework-provided behavior (routing, validation, exception mapping, request-id middleware, dependency injection) with explicit code.
- Biggest blast radius is inside `services/backend/log` plus test/build scripts. Downstream services are mostly unaffected if API contract remains unchanged.

## Current Runtime Architecture

### Core Runtime Path
1. API Gateway invokes Lambda handler `lambda_function.lambda_handler` (`platform/terraform/modules/lambda/main.tf:21`).
2. Handler uses Mangum adapter (`services/backend/log/lambda_function.py:11`, `:18-23`).
3. Mangum forwards API Gateway event to FastAPI app from `create_app()` (`services/backend/log/lambda_function.py:13`, `:22`).
4. FastAPI handles:
   - Middleware (`X-Request-Id`) (`services/backend/log/app/main.py:94`)
   - Auth and role checks (`services/backend/log/app/main.py:173`, `:266`; `app/auth.py`)
   - Request validation and error handling (`services/backend/log/app/main.py:125`, `:136`, `:148`)
   - Route dispatch for logs/AML/communications (`services/backend/log/app/main.py:231`, `:253`, `:460`, `:548` etc.)
5. Business logic goes through `LogService` + `LogRepository` into Postgres (`services/backend/log/app/service.py`, `services/backend/log/app/repository.py`).

### Local/CI Invocation Shape
- Fullstack script packages `lambda_function.py` + `app/` and installs dependencies from log `requirements.txt` (`scripts/ci/run-fullstack-integration-e2e.sh:377`, `:392-393`).
- LocalStack API Gateway REST API is provisioned with `ANY /` + `ANY /{proxy+}` Lambda proxy integration (`scripts/ci/run-fullstack-integration-e2e.sh:734`, `:827`, `:836`, `:852`).
- Health/readiness checks call `/health` and `/api/v1/logs/health` through this path (`scripts/ci/run-fullstack-integration-e2e.sh:994`, `:1018`).

### Infra Invocation Shape (Terraform)
- Terraform API Gateway v2 uses explicit route keys (not a default catch-all route) (`platform/terraform/modules/apigateway/main.tf:7`, `:49`).
- Routes include `/api/v1/logs/health` and business API paths, integrated via `AWS_PROXY` payload v2.0 (`platform/terraform/modules/apigateway/main.tf:8`, `:42`, `:44`).

### Additional Finding: Route Drift
- OpenAPI declares `/health` and `/api/v1/health` (`docs/api-contracts/openapi/log.yaml:35`, `:56`).
- Local/CI smoke checks actively use `/health` and `/api/v1/logs/health` (`scripts/ci/run-fullstack-integration-e2e.sh:994`, `:1018`).
- Terraform API Gateway route keys explicitly include `/api/v1/logs/health` but not `/health` or `/api/v1/health` (`platform/terraform/modules/apigateway/main.tf:7-25`).

Implication:
- If production topology relies strictly on Terraform HTTP API v2 route keys, `/health` and `/api/v1/health` may not be reachable unless additional routes are added.

## Is It Actually a Lambda Function?
Yes, operationally it is a Lambda function.

But architecturally it is Lambda-hosted FastAPI, not a direct Lambda handler:
- Lambda entrypoint exists and is used: `lambda_function.lambda_handler`.
- HTTP behavior is implemented by FastAPI + Mangum adapter, not by event-level routing in `lambda_handler`.

So the precise classification is: **Lambda runtime with ASGI framework adapter**.

## What Changes for a True Lambda Refactor (No FastAPI)

## Assumption
Goal is to preserve existing HTTP contract (paths/status codes/JSON shapes), and only remove FastAPI/Mangum.

### 1) Log Service Runtime Code (Required)
Required changes:
- Replace Mangum+ASGI delegation in `services/backend/log/lambda_function.py` with direct API Gateway event router.
- Remove route handlers from `services/backend/log/app/main.py` or replace file with plain helper functions used by Lambda router.
- Remove `app` export dependency on FastAPI app object (`services/backend/log/app/__init__.py:3`).
- Explicitly implement framework behaviors now implicit in FastAPI:
  - path/method routing
  - query/path/body parsing
  - schema validation using Pydantic models from `app/schemas.py`
  - exception-to-error response mapping (`validation_error`, `unauthorized`, `forbidden`, etc.)
  - request id generation/propagation (`X-Request-Id`)
  - auth + role checks currently wired through dependencies

Likely reusable with minor/no change:
- `services/backend/log/app/service.py`
- `services/backend/log/app/repository.py`
- `services/backend/log/app/auth.py`
- `services/backend/log/app/schemas.py`

### 2) Startup/Migrations Semantics (Required)
Currently bootstrap/migration invocation is in FastAPI lifespan (`services/backend/log/app/main.py:82-85`) and also covered in local/CI DB orchestration (`scripts/db/run-shared-postgres.sh:152-193`).

Without FastAPI, you must explicitly decide and implement one strategy:
- Option A: run `service.bootstrap()` once at cold start inside Lambda init path.
- Option B: rely only on external migration orchestration (script/CI/deployment pre-step).

If Option A is selected, add explicit idempotent cold-start migration call in Lambda code.

### 3) Dependencies and Packaging (Required)
Required updates:
- Remove `fastapi` and `mangum` from log requirements (`services/backend/log/requirements.txt:2-4`).
- Update artifact build package list (`scripts/ci/build_lambda_artifacts.py:19`).
- Keep packaging of business modules (`app/`) if reused.

### 4) Log Service Tests (Required)
Current tests are framework-coupled:
- FastAPI TestClient tests (`services/backend/log/tests/test_api.py:1`, `:10`).
- Mangum adapter tests (`services/backend/log/tests/test_lambda_handler.py:9-10`, `:53`, `:67`).

Required refactor:
- Replace with direct Lambda event contract tests (API Gateway v2 and/or REST proxy shapes used in repo).
- Keep service/repository/auth unit tests where still valid.

### 5) Pipelines/Lint/Coverage (Required)
Potential required adjustments depending on file layout:
- `services/backend/log/run-local-test-pipeline.py` assumes `app/` + `lambda_function.py` in compile/lint/cov (`:100`, `:106`, `:126-127`).
- `scripts/pipelines/test_all.py` has log unit test config expecting `--cov=app` (`:584`, `:594`).

If `app/main.py` is removed or app module layout changes, update these commands.

### 6) Infra and Gateway Routing (Conditional)
If API paths remain identical, most infra can stay unchanged.

Conditional changes only if you alter endpoint surface:
- API Gateway route list (`platform/terraform/modules/apigateway/main.tf:7+`)
- Nginx integration gateway paths (`scripts/ci/fullstack-gateway.nginx.conf:80-105`)
- CloudFront log API path patterns (`platform/terraform/modules/cloudfront/main.tf:17-23`)
- ALB path ownership (`platform/terraform/modules/alb/main.tf:14`, `:18`)

### 7) Downstream Service Consumers (Conditional)
Likely unaffected if contract is preserved:
- Client service audit log post (`services/backend/client/src/main/java/com/scroogebank/crm/client_service/logging/HttpClientAuditLogger.java:42`)
- Client communications APIs (`services/backend/client/src/main/java/com/scroogebank/crm/client_service/communication/HttpLogServiceCommunicationClient.java:26`, `:40`, `:56`, `:71`)
- Verification Lambda provider-message status patch (`services/backend/verification/lambda_function.py:160`)
- AML Lambda audit log path default (`services/backend/aml/lambda_function.py:75`)

These become affected only if response/error shapes or routes change.

### 8) Documentation (Required)
Update docs that explicitly state FastAPI/Mangum:
- `services/backend/log/README.md:10`, `:64`
- Root README FastAPI stack references (`README.md:9`, `:17`)
- Any architecture docs that describe log runtime as FastAPI adapter

Contract docs may remain unchanged if API surface is preserved:
- `docs/api-contracts/openapi/log.yaml`

## Repository Impact Map

### Must change for true Lambda (no FastAPI)
- `services/backend/log/lambda_function.py`
- `services/backend/log/app/main.py` (or equivalent replacement)
- `services/backend/log/app/__init__.py`
- `services/backend/log/requirements.txt`
- `services/backend/log/tests/test_api.py`
- `services/backend/log/tests/test_lambda_handler.py`
- `scripts/ci/build_lambda_artifacts.py`
- `services/backend/log/README.md`
- `README.md`

### Likely change depending on implementation layout
- `services/backend/log/run-local-test-pipeline.py`
- `scripts/pipelines/test_all.py`
- `scripts/ci/run-fullstack-integration-e2e.sh` (if event shape/tests/health route behavior changes)

### Change only if external API contract changes
- `platform/terraform/modules/apigateway/main.tf`
- `scripts/ci/fullstack-gateway.nginx.conf`
- `platform/terraform/modules/cloudfront/main.tf`
- `platform/terraform/modules/alb/main.tf`
- `docs/api-contracts/openapi/log.yaml`
- downstream client/verification/aml callers listed above

## Risk Areas During Refactor
- Error model drift (`validation_error` vs generic 500/400).
- Auth/role enforcement drift previously handled by FastAPI dependency flow.
- `X-Request-Id` propagation drift.
- Query/path/body parsing drift (especially prefixed IDs like `log_` / `com_`).
- Migration bootstrap behavior drift at cold start.

## Recommended Refactor Strategy
1. Implement direct Lambda router while preserving exact existing paths/status/error bodies.
2. Keep `service.py`, `repository.py`, `auth.py`, and `schemas.py` as stable core.
3. Port one endpoint group at a time (health -> logs -> AML -> communications) with snapshot tests.
4. Replace FastAPI/Mangum tests with direct event tests before removing dependencies.
5. Remove FastAPI/Mangum from packaging only after parity tests pass.
6. Keep OpenAPI and downstream callers unchanged unless intentionally versioning contract.

## Bottom Line
- Current service is a real Lambda deployment, but not a native Lambda HTTP implementation.
- Refactoring to true Lambda is feasible with moderate repo-wide impact concentrated in log runtime/test/build layers.
- External services and infra do not need broad changes if API contract remains stable.
