# Client Service

Client management microservice built with Java 21 and Spring Boot 3.

## Overview

The Client Service provides CRUD operations for managing clients in the Scroogebank CRM system. It handles client lifecycle management, validates client data, associates clients with agents, and emits audit events to the Log Service.

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

Start the service locally with an in-memory or local PostgreSQL database:

```bash
# Using default application.yml config (connects to localhost:5432)
./gradlew bootRun

# Or with custom config
./gradlew bootRun --args='--spring.profiles.active=dev'

# Or build and run JAR
./gradlew bootJar
java -jar build/libs/client-*.jar
```

**Service will start on:** `http://localhost:8081`

**Health check:** `curl http://localhost:8081/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8081` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm_db` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `postgres` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | `postgres` | Database password |
| `LOG_SERVICE_URL` | `http://localhost:8083` | Log service URL for audit events |

## Related Documentation

- **[Testing Guide](../../../docs/testing/TESTING-GUIDE.md)** - Testing workflows
- **[Configuration Guide](../../../docs/configuration.md)** - Environment variables and config
- **[API Contract](../../../docs/api-contracts/openapi/client.yaml)** - OpenAPI specification
- **[Coding Standards](../../../docs/coding-standards/coding-standards.md)** - Java code style guide
- **[Contributing Guide](../../../CONTRIBUTING.md)** - Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
