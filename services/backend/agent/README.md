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
- `POST /api/agents` - Create new agent
- `PUT /api/agents/{id}` - Update agent
- `DELETE /api/agents/{id}` - Delete agent
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

Start the service locally with an in-memory or local PostgreSQL database:

```bash
# Using default application.yml config (connects to localhost:5432)
./gradlew bootRun

# Or with custom config
./gradlew bootRun --args='--spring.profiles.active=dev'

# Or build and run JAR
./gradlew bootJar
java -jar build/libs/agent-*.jar
```

**Service will start on:** `http://localhost:8080`

**Health check:** `curl http://localhost:8080/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm_db` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `postgres` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | `postgres` | Database password |
| `LOG_SERVICE_URL` | `http://localhost:8083` | Log service URL for audit events |

**Example override:**
```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://myhost:5432/mydb
./gradlew bootRun
```

## Kubernetes Deployment

**Deployed via:** Kustomize overlay at `platform/k8s/apps/overlays/dev/`

**Deploy locally:**
```bash
python scripts/pipelines/deploy_k8s.py
```

**See:** [Local K8s Development Guide](../../../docs/local-k8s-dev.md)

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

Solution: Use H2 in-memory database for tests or mock the repository layer:

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
