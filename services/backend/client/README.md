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
- `POST /api/clients/{id}/upload-verify` - Public tokenized verification document upload (sets `pending`)
- `PATCH /api/clients/{id}/verify/review` - Admin review for pending verification (`approve`/`reject`)
- `GET /health` - Primary health check
- `GET /api/v1/health` - Legacy health endpoint
- `GET /api/v1/clients/health` - Legacy clients health endpoint

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

**Health check:** `curl http://localhost:8080/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.
Use `services/backend/client/.env.example` as the baseline local/dev template.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `crm_app` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | _(set in env / `.env.local`)_ | Database password |
| `CLIENT_LOG_SERVICE_URL` | `http://localhost:4566/restapis/<api-id>/local/_user_request_` | Canonical Lambda-backed log API URL for audit and communication APIs |
| `LOG_SERVICE_URL` | same as above | Backward-compatible fallback for `CLIENT_LOG_SERVICE_URL` |
| `VERIFICATION_SNS_TOPIC_ARN` | *(empty)* | SNS topic ARN used by `POST /api/clients` to publish verification-email requests |
| `VERIFICATION_DOCUMENTS_BUCKET` | *(empty)* | S3 bucket name used by `POST /api/clients/{id}/upload-verify` to store verification documents |
| `VERIFICATION_LINK_TOKEN_TTL_SECONDS` | `7200` | Verification link/token lifetime in seconds, used as source of truth for token minting and email expiry copy |
| `VERIFICATION_EMAIL_PROVIDER` | `mock` | Email provider for verification notifications (`mock` or `ses`) |
| `SES_SENDER_EMAIL` | *(empty)* | Verified SES sender email used when `VERIFICATION_EMAIL_PROVIDER=ses` |
| `VERIFICATION_EMAIL_AWS_REGION` | AWS SDK default chain | Canonical AWS region override for SES verification sender |
| `VERIFICATION_EMAIL_AWS_ENDPOINT_URL` | *(empty)* | Canonical endpoint override for SES verification sender (used for LocalStack) |
| `AWS_REGION` / `AWS_ENDPOINT_URL` | *(fallback)* | Backward-compatible fallbacks for verification SES settings |
| `VERIFICATION_EMAIL_DISPATCH_ENABLED` | `false` | Enables legacy queued verification email dispatch worker (non-canonical; opt-in only) |
| `VERIFICATION_EMAIL_DISPATCH_POLL_INTERVAL_MS` | `30000` | Worker polling interval for queued communications |
| `VERIFICATION_EMAIL_DISPATCH_MAX_BATCH_SIZE` | `50` | Max queued communications processed per poll |
| `VERIFICATION_EMAIL_DISPATCH_MAX_ATTEMPTS` | `5` | Max retry attempts before communication is marked failed |
| `VERIFICATION_EMAIL_DISPATCH_BASE_BACKOFF_SECONDS` | `30` | Base delay for exponential retry backoff |
| `VERIFICATION_EMAIL_DISPATCH_SERVICE_TOKEN_TTL_SECONDS` | `300` | TTL for internal service JWT used by worker |
| `VERIFICATION_EMAIL_DISPATCH_SERVICE_USER_ID` | `usr_system_verification` | Subject claim for internal service JWT |

Security note:
- Production must provide `JWT_HMAC_SECRET` and database credentials via environment/secrets.

## Verification Email Implementation

### Canonical Path
Verification email dispatch is SNS/Lambda-driven:
1. `POST /api/clients` creates client and mints verification token (TTL from `VERIFICATION_LINK_TOKEN_TTL_SECONDS`, default `7200`).
2. Client-service publishes `UPLOAD_VERIFICATION_REQUESTED` to SNS with `clientId`, `email`, `firstName`, and token.
   - If SNS publish fails, request fails and client creation is rolled back.
3. `services/backend/verification/lambda_function.py` sends SES email with `/verify-client` link and handles SES feedback updates.

### Legacy Optional Path
- `VerificationEmailDispatchService` and `VerificationEmailDispatchWorker` remain in code for backward compatibility.
- This worker path is non-canonical and disabled by default (`VERIFICATION_EMAIL_DISPATCH_ENABLED=false`).
- Do not rely on worker behavior for canonical verification smoke/contract checks.

### Local Dev vs AWS-backed Behavior
- Local/dev default:
  - `VERIFICATION_EMAIL_PROVIDER=mock`
  - dispatch worker disabled unless explicitly enabled
- AWS-backed:
  - `VERIFICATION_EMAIL_PROVIDER=ses`
  - `SES_SENDER_EMAIL` must be a verified SES identity
  - verification pipeline wiring requires `enable_verification_pipeline=true` in Terraform

### Verification Config Expectations
- Client-service runtime env:
  - `VERIFICATION_SNS_TOPIC_ARN`
  - `VERIFICATION_DOCUMENTS_BUCKET`
  - `VERIFICATION_EMAIL_PROVIDER`
  - `SES_SENDER_EMAIL` (when using SES)
- Verification Lambda runtime env:
  - `SES_SOURCE_EMAIL`
  - `FRONTEND_BASE_URL`
  - `LOG_API_BASE_URL` (for feedback events)

### Known Limitations
- Verification upload token can be reused until expiry (no one-time consumption).
- Resend verification endpoint is not implemented.

## Related Documentation

- **[Testing Guide](../../../docs/testing/TESTING-GUIDE.md)** - Testing workflows
- **[Configuration Guide](../../../docs/configuration.md)** - Environment variables and config
- **[API Contract](../../../docs/api-contracts/openapi/client.yaml)** - OpenAPI specification
- **[Coding Standards](../../../docs/coding-standards/coding-standards.md)** - Java code style guide
- **[Contributing Guide](../../../CONTRIBUTING.md)** - Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
