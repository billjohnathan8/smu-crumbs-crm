# Client Service

Client management microservice built with Java 21 and Spring Boot 3.

## Overview

The Client Service provides CRUD operations for managing clients in the Scroogebank CRM system. It handles client lifecycle management, validates client data, associates clients with users, and emits audit events to the Log Service.

**Technology Stack:**
- Java 21
- Spring Boot 3
- JPA/Hibernate
- PostgreSQL
- JUnit 5 + Mockito

## API Contract

**OpenAPI Specification:** [docs/api-contracts/openapi/client.yaml](../../../docs/api-contracts/openapi/client.yaml)

**Key Endpoints:**
- `GET /api/clients` - List all clients
- `GET /api/clients/{id}` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/{id}` - Update client
- `DELETE /api/clients/{id}` - Delete client
- `POST /api/clients/{id}/verify` - Verify client identity and trigger verification email
- `GET /health` - Health check

## Local Development

### Running Tests

From the **repository root**, use the unified Python pipeline:

```bash
# Test client service only
python scripts/pipelines/test_backend.py --service client

# Test all backend services
python scripts/pipelines/test_backend.py
```

**Or from this directory** (services/backend/client):

```bash
# Windows
.\gradlew.bat localTestPipeline

# macOS/Linux
./gradlew localTestPipeline
```

**What `localTestPipeline` does:**
1. **Checkstyle** - Lint code against Google Java Style Guide
2. **Build** - Compile sources
3. **Test** - Run JUnit 5 + Mockito tests
4. **JaCoCo** - Generate code coverage report

### Test Reports

After running tests, find reports in `build/reports/`:

| Report | Location |
|--------|----------|
| **Checkstyle (main)** | `build/reports/checkstyle/main.html` |
| **Checkstyle (test)** | `build/reports/checkstyle/test.html` |
| **Unit Tests** | `build/reports/tests/test/index.html` |
| **Code Coverage** | `build/reports/jacoco/test/html/index.html` |

**Aggregated backend coverage:** `build-logs/test-backend/index.html` (from repo root)

### Running Locally (Standalone)

Start the service locally with PostgreSQL (default local runtime contract):

```bash
# Use the explicit dev profile for local convenience defaults
./gradlew bootRun --args='--spring.profiles.active=dev'

# Or build and run JAR
./gradlew bootJar
java -jar build/libs/client-*.jar
```

**Service will start on:** `http://localhost:8080`

**Health check:** `curl http://localhost:8081/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.
Use `services/backend/client/.env.example` as the baseline local/dev template.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `crm_app` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | `devpassword` | Database password |
| `CLIENT_LOG_SERVICE_URL` | `http://localhost:4566/restapis/<api-id>/local/_user_request_` | Canonical Lambda-backed log API URL for audit and communication APIs |
| `LOG_SERVICE_URL` | same as above | Backward-compatible fallback for `CLIENT_LOG_SERVICE_URL` |
| `VERIFICATION_EMAIL_PROVIDER` | `mock` | Email provider for verification notifications (`mock` or `ses`) |
| `SES_SENDER_EMAIL` | *(empty)* | Verified SES sender email used when `VERIFICATION_EMAIL_PROVIDER=ses` |
| `VERIFICATION_EMAIL_AWS_REGION` | AWS SDK default chain | Canonical AWS region override for SES verification sender |
| `VERIFICATION_EMAIL_AWS_ENDPOINT_URL` | *(empty)* | Canonical endpoint override for SES verification sender (used for LocalStack) |
| `AWS_REGION` / `AWS_ENDPOINT_URL` | *(fallback)* | Backward-compatible fallbacks for verification SES settings |
| `VERIFICATION_EMAIL_DISPATCH_ENABLED` | `true` | Enables queued verification email dispatch worker |
| `VERIFICATION_EMAIL_DISPATCH_POLL_INTERVAL_MS` | `30000` | Worker polling interval for queued communications |
| `VERIFICATION_EMAIL_DISPATCH_MAX_BATCH_SIZE` | `50` | Max queued communications processed per poll |
| `VERIFICATION_EMAIL_DISPATCH_MAX_ATTEMPTS` | `5` | Max retry attempts before communication is marked failed |
| `VERIFICATION_EMAIL_DISPATCH_BASE_BACKOFF_SECONDS` | `30` | Base delay for exponential retry backoff |
| `VERIFICATION_EMAIL_DISPATCH_SERVICE_TOKEN_TTL_SECONDS` | `300` | TTL for internal service JWT used by worker |
| `VERIFICATION_EMAIL_DISPATCH_SERVICE_USER_ID` | `usr_system_verification` | Subject claim for internal service JWT |

Security note:
- Production must provide `JWT_HMAC_SECRET` and database credentials via environment/secrets.

## Verification Email Implementation

### What Was Added
- Added a client-service email abstraction: `VerificationEmailSender`.
- Added SES implementation: `SesVerificationEmailSender` (AWS SDK v2 SES).
- Added local/mock implementation: `MockVerificationEmailSender`.
- Added provider router: `VerificationEmailSenderRouter`.
- Added template renderer and external templates:
  - `services/backend/client/src/main/resources/templates/verification-email/subject.txt`
  - `services/backend/client/src/main/resources/templates/verification-email/body.txt`
- Added idempotent communication creation (`verification-email:{clientId}`) via log service.
- Added communication lifecycle support:
  - `status`, `provider_message_id`, `error_message`
  - `retry_count`, `next_attempt_at`, `last_attempt_at`, `delivery_event`
  - `idempotency_key`
- Added communication lifecycle APIs in log service:
  - `GET /api/communications/queued`
  - `PATCH /api/communications/{communicationId}/status`
  - `PATCH /api/communications/provider/{providerMessageId}/status`
- Integrated queue + dispatch trigger into `ClientServiceImpl.verifyClient(...)`.
- Added scheduled retry worker in client service with exponential backoff.
- Added SES feedback consumer Lambda (`services/backend/verification`) for SNS delivery/bounce/complaint/reject updates.
- Added Terraform wiring for SES notification topic, verification feedback Lambda subscription, runtime env variables, IAM permissions, and SES reputation alarms.
- Added tests for verification triggering path, mail abstractions, log-service communication lifecycle behavior, and verification feedback handling.

### How Verification Email Sending Works
1. `POST /api/clients/{id}/verify` calls `ClientServiceImpl.verifyClient(...)`.
2. Verification status is updated to `verified` and persisted.
3. Existing audit log behavior is preserved.
4. The service renders a verification email from templates.
5. It creates/updates a communication record with idempotency key `verification-email:{clientId}`.
6. An immediate send attempt is executed through `VerificationEmailSenderRouter`.
7. Success updates communication status to `sent` with `providerMessageId`.
8. Failure updates communication status to `queued` with retry metadata, or `failed` when max attempts are exhausted.
9. The scheduled worker retries due queued communications with exponential backoff.
10. SES SNS feedback events are consumed by the verification Lambda and mapped back to communications via `providerMessageId`.

### Local Dev vs AWS-backed Behavior
- Local/dev default:
  - `VERIFICATION_EMAIL_PROVIDER=mock`
  - No SES credentials required.
  - Full queue/retry/status flow still executes with mock sender IDs.
- AWS-backed:
  - Set `VERIFICATION_EMAIL_PROVIDER=ses`
  - Set `SES_SENDER_EMAIL` to a verified SES sender identity.
  - Ensure runtime credentials and region are available (`AWS_REGION` optional if otherwise discoverable).
  - SES failures remain in communication retry lifecycle (`queued`/`failed`) and can be finalized by feedback events.

### SES Config Expectations
- Client service env/config:
  - `VERIFICATION_EMAIL_PROVIDER`
  - `SES_SENDER_EMAIL`
  - `AWS_REGION`
  - `VERIFICATION_EMAIL_DISPATCH_*`
- Terraform:
  - `ses_sender_email`
  - `enable_verification_pipeline=true` to enable SNS/SES/Lambda feedback path and required IAM wiring.

### Known Limitations
- Verification email currently sends plain text only.
- Dead-letter handling for verification email retries is modeled as persisted terminal `failed` communications; no separate SQS DLQ is used.

## Related Documentation

- **[Testing Guide](../../../docs/testing/TESTING-GUIDE.md)** - Testing workflows
- **[Configuration Guide](../../../docs/configuration.md)** - Environment variables and config
- **[API Contract](../../../docs/api-contracts/openapi/client.yaml)** - OpenAPI specification
- **[Coding Standards](../../../docs/coding-standards/coding-standards.md)** - Java code style guide
- **[Contributing Guide](../../../CONTRIBUTING.md)** - Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
