# User Service

Banking CRM user management microservice built with Java 21 and Spring Boot 3.

## Overview

The User Service provides CRUD operations for managing users in the Scroogebank CRM system. It handles user lifecycle management, validates user data, and emits audit events to the Log Service.

**Technology Stack:**
- Java 21
- Spring Boot 3
- JPA/Hibernate
- PostgreSQL
- JUnit 5 + Mockito

## API Contract

**OpenAPI Specification:** [docs/api-contracts/openapi/user.yaml](../../../docs/api-contracts/openapi/user.yaml)

**User endpoints:**
- `GET /api/users` - List all users
- `GET /api/users/{id}` - Get user by ID
- `GET /api/users/me` - Get authenticated user's own profile
- `POST /api/users` - Create new user
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Delete user
- `POST /api/users/{id}/disable` - Disable user
- `POST /api/users/{id}/reset-password` - Admin-initiated password reset

**Auth endpoints:**
- `POST /api/auth/login` - Authenticate, returns JWT access + refresh tokens
- `POST /api/auth/refresh` - Refresh access token using refresh token
- `POST /api/auth/forgot-password` - Initiate self-service password reset (always returns 200)
- `POST /api/auth/reset-password` - Complete password reset with token

**Health endpoints:**
- `GET /health` - Primary health check
- `GET /api/v1/health` - Legacy health endpoint
- `GET /api/v1/users/health` - Legacy users health endpoint

Test-only password reset helper:
- `GET /api/test/password-reset/latest-token?email=...` is only enabled when `spring.profiles.active` includes `local` or `test`.
- In non-local/test profiles this path is blocked and cannot be used for token introspection.

## Local Development

### Running Tests

From the **repository root**, use the unified Python pipeline:

```bash
# Test user service only
python scripts/pipelines/test_backend.py --service user

# Test all backend services
python scripts/pipelines/test_backend.py
```

**Or from this directory** (services/backend/user):

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
java -jar build/libs/user-*.jar
```

**Service will start on:** `http://localhost:8080`

**Health check:** `curl http://localhost:8080/health`

### Configuration

See [Configuration Guide](../../../docs/configuration.md) for full details.
Use `services/backend/user/.env.example` as the baseline local/dev template.

**Key environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm` | Database URL |
| `SPRING_DATASOURCE_USERNAME` | `crm_app` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | _(set in env / `.env.local`)_ | Database password |
| `APP_USER_STORE_TYPE` | `postgres` | User store backend (`postgres` for local/integration runtime) |
| `LOG_SERVICE_URL` | `http://localhost:4566/restapis/<api-id>/local/_user_request_` | Lambda-backed log API URL for audit events |
| `SPRING_PROFILES_ACTIVE` | _(unset)_ | Use `local` for local/integration test helper routes; do not enable in prod/lab profiles |

Security note:
- Production must provide `JWT_HMAC_SECRET` and `ROOT_ADMIN_PASSWORD` via environment/secrets.

**Example override:**
```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://myhost:5432/mydb
./gradlew bootRun
```

## Project Structure

```
services/backend/user/
├── src/
│   ├── main/
│   │   ├── java/com/itsa/crm/user/
│   │   │   ├── controller/     # REST controllers
│   │   │   ├── service/        # Business logic
│   │   │   ├── repository/     # JPA repositories
│   │   │   ├── model/          # Domain entities
│   │   │   └── config/         # Spring configuration
│   │   └── resources/
│   │       └── application.yml  # Configuration
│   └── test/
│       └── java/com/itsa/crm/user/  # Unit tests
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
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void getUserById_whenUserExists_returnsUser() {
        // Given
        Long userId = 1L;
        User mockUser = new User(userId, "John Doe", "john@example.com");
        when(userRepository.findById(userId)).thenReturn(Optional.of(mockUser));

        // When
        User result = userService.getUserById(userId);

        // Then
        assertNotNull(result);
        assertEquals(userId, result.getId());
        assertEquals("John Doe", result.getName());
        verify(userRepository).findById(userId);
    }

    @Test
    void getUserById_whenUserNotFound_throwsException() {
        // Given
        Long userId = 999L;
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        // When / Then
        assertThrows(UserNotFoundException.class, () -> {
            userService.getUserById(userId);
        });
    }
}
```

## Troubleshooting

**Issue: Tests fail with database connection error**

Solution: unit tests use `src/test/resources/application.yaml` (H2 + in-memory store). If needed, mock repository dependencies:

```java
@DataJpaTest  // Uses H2 by default
class UserRepositoryTest {
    @Autowired
    private UserRepository userRepository;

    @Test
    void saveAgent_persistsToDatabase() {
        User user = new User("Jane Doe", "jane@example.com");
        User saved = userRepository.save(user);
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
- **[API Contract](../../../docs/api-contracts/openapi/user.yaml)** - OpenAPI specification
- **[Coding Standards](../../../docs/coding-standards/coding-standards.md)** - Java code style guide
- **[Contributing Guide](../../../CONTRIBUTING.md)** - Development workflow

---

**Back to:** [Main README](../../../README.md) | [Documentation Hub](../../../docs/README.md)
