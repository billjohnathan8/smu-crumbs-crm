# Integration Tests

Full-stack system integration tests for the Scroogebank CRM platform.

## Purpose

These tests validate the entire system working together:
- Frontend UI (React)
- All backend microservices (agent, client, transaction, log services)
- PostgreSQL database
- LocalStack (AWS services)

Unlike the mocked frontend tests in `services/frontend/crm-ui/e2e/`, these tests use **real backend connections** and test actual API integrations.

## Why Root-Level?

Integration tests belong at the system boundary because they test:
- Cross-service workflows (frontend → multiple backend services)
- Database persistence across services
- Authentication flows spanning UI and API
- End-to-end business processes

They are not frontend-only tests, so they live outside the frontend service directory.

## Prerequisites

The full system must be running:

```bash
# First-time setup
make dev-setup

# Start all services + DB + LocalStack
make test-and-spinup-all
```

Verify services are healthy:
- Frontend: http://localhost:4173
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432
- LocalStack: http://localhost:4566

## Running Tests

```bash
cd tests/integration
npm install
npm test                 # Run all tests
npm run test:ui          # Interactive UI mode
npm run test:headed      # Watch tests run in browser
npm run test:debug       # Debug mode
npm run report           # View last test report
```

## Test Credentials

Tests use real authentication against the backend:

- **Admin**: `admin@scroogebank.com` / `AdminPass123!`
- **Agent**: `agent@scroogebank.com` / `AgentPass123!`

These credentials are seeded during `make dev-setup`.

## Test Structure

```
tests/integration/
├── admin-flows.spec.ts        # Admin user management & CRUD
├── agent-flows.spec.ts        # Agent ticket handling workflows
├── agent-logout.spec.ts       # Agent logout functionality
├── protected-routes.spec.ts   # Authentication & authorization
├── real-fullstack.spec.ts     # Smoke test for full system
└── helpers/                   # Test utilities
    ├── auth.ts                # Login helpers
    ├── mockRoutes.ts          # Route mocking patterns (legacy)
    └── testData.ts            # Test data generators
```

## CI/CD Integration

Integration tests run in CI after unit tests and mocked e2e tests:

```yaml
# .github/workflows/ci-integration.yml
- Layer 4: Integration Tests
  - Requires: Docker, Kind, Helm
  - Spin up: Full platform stack
  - Run: npm test from tests/integration/
  - Teardown: make clean-kind
```

See CI workflow documentation in `docs/` for more details.

## Troubleshooting

### Tests fail with "ECONNREFUSED"
- Ensure backend services are running: `docker ps`
- Check service health: `curl http://localhost:8080/actuator/health`
- Review logs: `docker-compose logs backend`

### Authentication failures
- Verify database is seeded: `make dev-setup`
- Check credentials in test files match seeded users
- Ensure JWT tokens are not expired

### Timeouts
- Integration tests are slower than unit tests (expect 30s-2min)
- Increase timeout in playwright.config.ts if needed
- Check for resource constraints (Docker CPU/memory limits)

## Comparison: Mocked vs Integration

| Aspect | Mocked Tests | Integration Tests |
|--------|--------------|-------------------|
| Location | `services/frontend/crm-ui/e2e/` | `tests/integration/` |
| Backend | Mocked via Playwright | Real microservices |
| Database | Not used | PostgreSQL required |
| Speed | Fast (~10s) | Slow (~1-2min) |
| CI Layer | Layer 3 | Layer 4 |
| Purpose | UI logic only | Full system validation |

Use mocked tests for rapid UI feedback, integration tests for release confidence.
