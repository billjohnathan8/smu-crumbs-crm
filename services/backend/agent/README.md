# Agent Service

Insurance agent management microservice built with Java 21 and Spring Boot 3.

## Overview

The Agent Service provides CRUD operations for managing insurance agents in the Scroogebank CRM system. It handles agent lifecycle management, validates agent data, and emits audit events to the Log Service.

**Technology Stack:**
- Java 21
- Spring Boot 3
- JPA/Hibernate
- PostgreSQL
- JUnit 5 + Mockito

## API Contract

**OpenAPI Specification:** [docs/api-contracts/openapi/agent.yaml](../../../docs/api-contracts/openapi/agent.yaml)

**Key Endpoints:**
- `GET /api/agents` - List all agents
- `GET /api/agents/{id}` - Get agent by ID
- `GET /api/agents/me` - Get user's own profile
- `POST /api/agents` - Create new agent
- `PUT /api/agents/{id}` - Update agent
- `DELETE /api/agents/{id}` - Delete agent
- `DELETE /api/agents/{id}/disable` - Disable user
- `GET /health` - Health check

## Local Development

### Running Tests

From the **repository root**, use the unified Python pipeline:

```bash
# Test agent service only
python scripts/pipelines/test_backend.py --service agent

# Test all backend services
python scripts/pipelines/test_backend.py
```

**Or from this directory** (services/backend/agent):

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
java -jar build/libs/agent-*.jar
```

**Service will start on:** `http://localhost:8080`

**Health check:** `curl http://localhost:8080/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.
Use `services/backend/agent/.env.example` as the baseline local/dev template.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `crm_app` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | `devpassword` | Database password |
| `APP_USER_STORE_TYPE` | `postgres` | User store backend (`postgres` for local/integration runtime) |
| `LOG_SERVICE_URL` | `http://localhost:4566/restapis/<api-id>/local/_user_request_` | Lambda-backed log API URL for audit events |

Security note:
- Production must provide `JWT_HMAC_SECRET` and `ROOT_ADMIN_PASSWORD` via environment/secrets.

**Example override:**
```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://myhost:5432/mydb
./gradlew bootRun
```

## Project Structure

```
services/backend/agent/
├── src/
│   ├── main/
│   │   ├── java/com/itsa/crm/agent/
│   │   │   ├── controller/     # REST controllers
│   │   │   ├── service/        # Business logic
│   │   │   ├── repository/     # JPA repositories
│   │   │   ├── model/          # Domain entities
│   │   │   └── config/         # Spring configuration
│   │   └── resources/
│   │       └── application.yml  # Configuration
│   └── test/
│       └── java/com/itsa/crm/agent/  # Unit tests
├── build.gradle                 # Gradle build configuration
├── gradlew / gradlew.bat       # Gradle wrapper
└── README.md                    # This file
```

## Testing Guidelines

### Coverage Requirements

- **Line Coverage:** ≥ 80%
- **Branch Coverage:** ≥ 75%

### Writing Tests

**Test class naming:** `<ClassName>Test`
**Test method naming:** `<methodName>_<scenario>_<expectedResult>`

**Example:**

```java
@ExtendWith(MockitoExtension.class)
class AgentServiceTest {

    @Mock
    private AgentRepository agentRepository;

    @InjectMocks
    private AgentService agentService;

    @Test
    void getAgentById_whenAgentExists_returnsAgent() {
        // Given
        Long agentId = 1L;
        Agent mockAgent = new Agent(agentId, "John Doe", "john@example.com");
        when(agentRepository.findById(agentId)).thenReturn(Optional.of(mockAgent));

        // When
        Agent result = agentService.getAgentById(agentId);

        // Then
        assertNotNull(result);
        assertEquals(agentId, result.getId());
        assertEquals("John Doe", result.getName());
        verify(agentRepository).findById(agentId);
    }

    @Test
    void getAgentById_whenAgentNotFound_throwsException() {
        // Given
        Long agentId = 999L;
        when(agentRepository.findById(agentId)).thenReturn(Optional.empty());

        // When / Then
        assertThrows(AgentNotFoundException.class, () -> {
            agentService.getAgentById(agentId);
        });
    }
}
```

## Troubleshooting

**Issue: Tests fail with database connection error**

Solution: unit tests use `src/test/resources/application.yaml` (H2 + in-memory store). If needed, mock repository dependencies:

```java
@DataJpaTest  // Uses H2 by default
class AgentRepositoryTest {
    @Autowired
    private AgentRepository agentRepository;

    @Test
    void saveAgent_persistsToDatabase() {
        Agent agent = new Agent("Jane Doe", "jane@example.com");
        Agent saved = agentRepository.save(agent);
        assertNotNull(saved.getId());
    }
}
```

**Issue: Checkstyle failures**

Solution: Configure your IDE to use the Checkstyle config at `config/checkstyle/checkstyle.xml` and auto-format code.

**More help:** [Troubleshooting Guide](../../../docs/troubleshooting.md)

## Related Documentation

- **[Testing Guide](../../../docs/testing/TESTING-GUIDE.md)** - Testing workflows
- **[Configuration Guide](../../../docs/configuration.md)** - Environment variables and config
- **[API Contract](../../../docs/api-contracts/openapi/agent.yaml)** - OpenAPI specification
- **[Coding Standards](../../../docs/coding-standards/coding-standards.md)** - Java code style guide
- **[Contributing Guide](../../../CONTRIBUTING.md)** - Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
