# Testing Guide

Comprehensive testing documentation for the Scrooge Bank CRM system.

**Run all commands from repository root.**

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Functional Testing](#functional-testing)
3. [Performance Testing](#performance-testing)
4. [Additional Performance Commands](#additional-performance-commands)
5. [Local Development Stack](#local-development-stack)
6. [Frontend E2E & Latency Testing](#frontend-e2e--latency-testing)
7. [Fullstack Integration Testing](#fullstack-integration-testing)
8. [Database Bootstrap](#database-bootstrap)
9. [Output Locations](#output-locations)
10. [Related Documentation](#related-documentation)
11. [Troubleshooting](#troubleshooting)
12. [Quick Command Reference](#quick-command-reference)

---

## Quick Reference

### Run All Tests (CI Equivalent)

```bash
python scripts/pipelines/test_all.py
```

Use `python3` on Linux/macOS/WSL when needed.

### Quick Dev Workflows

```bash
# Backend only (lint, format, unit tests)
python scripts/pipelines/test_backend.py

# Frontend only (lint, format, unit, component tests)
python scripts/pipelines/test_frontend.py

# Frontend latency validation (CS301 <5s requirement)
cd services/frontend/crm-ui && npm run test:e2e:latency

# Quick performance smoke test (10 threads)
bash scripts/dev/run-perf-smoke.sh

# Full performance validation (100 threads)
bash scripts/dev/run-perf-full.sh

# Complete performance suite (frontend latency + backend JMeter)
bash scripts/dev/run-full-performance-suite.sh
```

---

## Functional Testing

### Main Test Suite (`test_all.py`)

Runs the complete CI test pipeline locally.

**Usage:**

```bash
python scripts/pipelines/test_all.py
```

**Common Flags:**

```bash
python scripts/pipelines/test_all.py --skip-fullstack
python scripts/pipelines/test_all.py --fullstack-mode smoke
python scripts/pipelines/test_all.py --skip-frontend-latency
python scripts/pipelines/test_all.py --skip-terraform
python scripts/pipelines/test_all.py --skip-openapi
python scripts/pipelines/test_all.py --local-phase5
python scripts/pipelines/test_all.py --dry-run
```

### Suite Wrappers

Individual test suite runners for faster iteration:

```bash
python scripts/pipelines/test_backend.py
python scripts/pipelines/test_frontend.py
python scripts/pipelines/test_terraform.py
```

**Note:** `test_terraform.py` is standalone and intentionally isolated from `test_all.py`.

### Test Layer Execution Order

When running `test_all.py`, tests execute in this order:

1. **Backend lint / format / typecheck** - Java services static analysis
2. **Backend unit / component tests** - Isolated business logic tests
3. **Frontend lint / format / typecheck** - React/TypeScript static analysis
4. **Frontend unit / component tests** - Vitest + React Testing Library
5. **Frontend Latency Tests** - Playwright E2E with mocked backend (CS301 <5s requirement)
6. **Fullstack integration E2E** - Docker Compose + LocalStack + HTTP smoke + Playwright

This ordering provides fast feedback on code quality before running expensive integration tests.

### Runtime Baseline (Latest Local Runs)

Runtime numbers from the latest build logs on `2026-03-29`.

| Command | Observed Runtime | Result |
|---|---:|---|
| `python scripts/pipelines/test_all.py` | ~48m 24s | ✅ Passed |
| Fullstack integration (Layer 6) | ~9m 17s | ✅ Passed |
| Frontend Latency Tests (Layer 5) | ~2m 18s | ✅ Passed |
| JMeter stress test (Layer 7) | ~14m 26s | ✅ Passed |

**Detailed timings:** `build-logs/test-all/last-run-summary.md`

**Note:** Runtime varies based on Docker cache, npm/pip cache, and LocalStack cold starts.

---

## Performance Testing

Performance testing validates CS301 requirements:
- **Frontend latency <5 seconds** for all operations
- **100 concurrent agents** using client-service
- System stability under load

### Prerequisites

**JMeter Installation:**

```bash
# Download JMeter 5.6.3 or later
wget https://downloads.apache.org/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz
export PATH=$PATH:$(pwd)/apache-jmeter-5.6.3/bin

# Verify installation
jmeter --version
```

**Windows (Chocolatey):**

```powershell
choco install jmeter
```

**Local Dev Stack:**

```bash
bash scripts/dev/stack-up.sh
```

Wait until nginx is healthy at `http://127.0.0.1:18088`.

### Quick Commands

```bash
# Quick smoke test (10 threads, ~30s)
bash scripts/dev/run-perf-smoke.sh
bash scripts/dev/run-perf-smoke-with-cleanup.sh  # Auto cleanup stack after

# Full CS301 validation (100 threads, ~2-4min)
bash scripts/dev/run-perf-full.sh
bash scripts/dev/run-perf-full-with-cleanup.sh   # Auto cleanup stack after

# Complete suite (frontend latency + backend JMeter)
bash scripts/dev/run-full-performance-suite.sh
bash scripts/dev/run-full-performance-suite.sh --skip-frontend
bash scripts/dev/run-full-performance-suite.sh --skip-backend
```

### Individual Test Scenarios

Located in `scripts/performance/`:

```bash
# 1. Baseline (1 thread, 100 loops)
bash scripts/performance/run-baseline.sh
# Purpose: Establish baseline metrics without concurrency
# Expected: P95 <500ms, 0% errors

# 2. 100 Concurrent Threads (CS301 requirement)
bash scripts/performance/run-100-threads.sh
# Purpose: Validate "100 concurrent agents" requirement
# Expected: P95 <5s, <1% errors

# 3. Burst Load (100 threads, 5s ramp-up)
bash scripts/performance/run-100-threads-burst.sh
# Purpose: Test system under sudden load spike
# Expected: Graceful handling, no crashes

# 4. Stress Test (200 threads)
bash scripts/performance/run-stress-test.sh
# Purpose: Identify saturation point and failure modes
# Expected: Document limits, verify recovery

# 5. AWS Validation
bash scripts/performance/run-jmeter-against-aws.sh <alb-dns-name>
# Purpose: Validate ECS autoscaling and ALB behavior
# Note: Requires deployed AWS environment
```

### JMeter Test Plan

**Location:** `tests/performance/agent-crud-workflow.jmx`

**Workflow simulated:**
1. Login → Extract JWT token
2. Create Client → Extract clientId
3. Get Client → Verify retrieval
4. Create Account → Link to client
5. List Transactions → Query client transactions

**Assertions:**
- HTTP 200/201 response codes
- Response time <5s (CS301 requirement)
- JWT token extraction success
- Dynamic ID extraction (no hardcoded values)

### Test Parameters

Override via `-Jkey=value` command line flags:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `host` | `127.0.0.1` | Target host (ALB DNS for AWS) |
| `port` | `18088` | Target port (80 for ALB, 18088 for local) |
| `threads` | `100` | Concurrent threads (simulates agents) |
| `rampup` | `60` | Ramp-up period (seconds) |
| `loops` | `10` | Iterations per thread |

**Example:**

```bash
jmeter -n -t tests/performance/agent-crud-workflow.jmx \
  -Jthreads=50 \
  -Jrampup=30 \
  -Jloops=5 \
  -l build-logs/performance/results.csv \
  -e -o build-logs/performance/report
```

### Results Analysis

**Output Locations:**

```
build-logs/performance/<test-name>/<timestamp>/
├── results.csv          # Raw JMeter results
├── report/
│   └── index.html      # Interactive dashboard
└── jmeter.log          # Execution log
```

**HTML Dashboard includes:**
- APDEX (Application Performance Index)
- Response time percentiles (P50, P90, P95, P99)
- Throughput (requests/sec)
- Error rate (%)
- Response time over time graph
- Active threads over time graph

**Open report:**

```bash
# Windows
start build-logs/performance/<test-name>/<timestamp>/report/index.html

# Linux/macOS
open build-logs/performance/<test-name>/<timestamp>/report/index.html
```

### Success Criteria (CS301)

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Error Rate** | <1% | Must be <5% |
| **P95 Response Time** | <2s | Must be <5s |
| **Throughput** | ≥10 req/sec @ 100 threads | System-dependent |
| **System Stability** | No crashes | Must remain operational |

### Threshold Validation

Automate pass/fail checks using the validation script:

```bash
python scripts/ci/validate-performance-thresholds.py \
  --results-csv build-logs/performance/.../results.csv \
  --error-rate-threshold 5.0 \
  --p95-latency-threshold 5000 \
  --fail-on-violation
```

**Exit codes:**
- `0` - All thresholds passed
- `1` - Threshold violation or error

### Common Failure Modes

| Symptom | Root Cause | Solution |
|---------|-----------|----------|
| HTTP 500, "timeout acquiring connection" | DB pool exhaustion | Increase HikariCP pool size |
| Increasing response times, OOM | Memory pressure | Increase JVM heap, tune GC |
| High latency on create/update | Log service bottleneck | Make log calls async, add circuit breaker |
| Audit publish errors | SNS rate limit | Batch events, add retry with backoff |

### Troubleshooting

**JMeter Errors:**

```bash
# Connection refused
bash scripts/dev/stack-up.sh
curl http://127.0.0.1:18088/actuator/health

# TOKEN_NOT_FOUND or CLIENT_ID_NOT_FOUND
# Run JMeter in GUI mode to inspect responses
jmeter -t tests/performance/agent-crud-workflow.jmx

# OutOfMemoryError
export HEAP="-Xms1g -Xmx4g"
# Disable "View Results Tree" listener
# Use non-GUI mode for load tests
```

**Stack Issues:**

```bash
# Check Postgres
docker ps | grep postgres
docker logs <postgres-container-id>

# Check backend services
curl http://127.0.0.1:18088/api/clients/actuator/health
docker logs <client-service-container-id>

# Restart stack
bash scripts/dev/stack-down.sh
bash scripts/dev/stack-up.sh
```

### Best Practices

1. **Always run baseline first** - Establishes known-good metrics
2. **Ramp up gradually** - Avoid sudden load spikes
3. **Monitor system metrics** - Watch Docker stats, Postgres connections
4. **Disable GUI listeners for load tests** - Use non-GUI mode for >10 threads
5. **Clean state between tests** - Restart stack for reproducible results
6. **Document all results** - Capture metrics, screenshots, system state
7. **Version control results** - Tag with git commit SHA

### Additional Documentation

- **Detailed guide:** `tests/performance/README.md`
- **CS301 requirements:** `docs/diff/features-compliance/prompt_b_infrastructure.md`
- **Performance audit:** `docs/audits/performance-testing-readiness-audit.md`
- **JMeter docs:** https://jmeter.apache.org/usermanual/index.html

---

---

## Additional Performance Commands

This section is a command catalog for all performance-testing entry points in the repository.

### 1) Full-Lifecycle Suite Environment Flags

```bash
# Run only gradual + stress (skip burst)
SKIP_BURST_TEST=1 bash scripts/dev/run-perf-full-with-cleanup.sh

# Run capacity-only tests (skip stress)
SKIP_STRESS_TEST=1 bash scripts/dev/run-perf-full-with-cleanup.sh

# Tighten/override SLO gates and repeats
PERF_REPEATS=3 PERF_MAX_ERROR_RATE_PCT=1.0 PERF_MAX_P95_MS=5000 \
  bash scripts/dev/run-perf-full-with-cleanup.sh
```

### 2) Python JMeter Runner (SLO + Repeats + Concurrency Proof)

```bash
# Single mode run
python scripts/performance/run_jmeter_tests.py --test-mode smoke

# CS301 concurrency validation with strict gates
python scripts/performance/run_jmeter_tests.py \
  --test-mode concurrent \
  --repeats 3 \
  --slo-max-error-rate-pct 1.0 \
  --slo-max-p95-ms 5000

# Burst and stress examples
python scripts/performance/run_jmeter_tests.py --test-mode burst --repeats 3
python scripts/performance/run_jmeter_tests.py --test-mode stress --repeats 2

# Custom output folder and host/port
python scripts/performance/run_jmeter_tests.py \
  --test-mode concurrent \
  --host 127.0.0.1 \
  --port 18088 \
  --output-dir build-logs/performance/manual-concurrent
```

Supported `--test-mode` values: `baseline`, `smoke`, `concurrent`, `burst`, `stress`.

### 3) CI-Equivalent Performance Layer (`test_all.py`)

```bash
# Run full local CI flow with performance layer enabled
python scripts/pipelines/test_all.py \
  --performance-mode full \
  --performance-repeats 3

# Recovery validation flow (baseline -> stress -> baseline)
python scripts/pipelines/test_all.py \
  --performance-mode recovery \
  --performance-repeats 2

# Full suite with pre/post-stress baseline checks
python scripts/pipelines/test_all.py \
  --performance-mode full-with-recovery \
  --performance-repeats 2

# Customize SLO gates for performance layer
python scripts/pipelines/test_all.py \
  --performance-mode concurrent \
  --performance-max-error-rate-pct 1.0 \
  --performance-max-p95-ms 5000

# Explicitly skip performance layer (for non-perf runs)
python scripts/pipelines/test_all.py --skip-performance
```

### 4) Frontend Latency Performance Commands

```bash
cd services/frontend/crm-ui
npm run test:e2e:latency
npm run e2e
npm run e2e:report
```

---

## Local Development Stack

### Start/Stop Commands

```bash
# Start full stack (no tests)
bash scripts/dev/stack-up.sh

# Stop and remove all containers
bash scripts/dev/stack-down.sh
```

**What it runs:**
- PostgreSQL (port 5432)
- LocalStack (port 4566) - AWS service mocks
- Backend services (Spring Boot + Python Lambda)
- Nginx gateway (port 18088)

**Use cases:**
- Manual exploration and debugging
- Performance testing (JMeter)
- Integration with external tools (Postman, curl)
- Frontend development against real backend

**Health check:**

```bash
curl http://127.0.0.1:18088/actuator/health
```

### Service URLs

| Service | Local URL | Purpose |
|---------|-----------|---------|
| **Nginx Gateway** | `http://127.0.0.1:18088` | Main entry point |
| **Client Service** | `http://127.0.0.1:18088/api/clients` | CRM client management |
| **User Service** | `http://127.0.0.1:18088/api/users` | User/auth management |
| **Transaction Service** | `http://127.0.0.1:18088/api/transactions` | Transaction queries |
| **Log Service** | `http://127.0.0.1:18088/api/logs` | Audit logging |
| **PostgreSQL** | `localhost:5432` | Database (user: `crm_app`) |
| **LocalStack** | `http://localhost:4566` | AWS service mocks |

---

## Frontend E2E & Latency Testing

### Frontend Latency Tests (CS301 Compliance)

Validates the CS301 requirement: **all frontend operations must complete within 5 seconds**.

**Location:** `services/frontend/crm-ui/e2e/`

**Key Files:**
- `e2e/utils/performance.ts` - Timing utilities (`measureLatency`, `logPerformanceMetric`)
- `e2e/performance.spec.ts` - Dedicated performance test suite
- All `*.spec.ts` files include latency measurements for critical operations
- `playwright.latency.config.ts` - Latency-specific Playwright config (mocked backend)

### Run Commands

```bash
# From repo root
cd services/frontend/crm-ui

# Run latency tests (mocked backend)
npm run test:e2e:latency

# Run all E2E tests (mocked backend)
npm run e2e

# Run with UI mode (interactive)
npm run e2e:ui

# View last run report
npm run e2e:report
```

### What's Measured

All critical user operations are tested against the 5-second threshold:

| Category | Operations Tested |
|----------|-------------------|
| **Authentication** | Login → Dashboard navigation, Protected route redirects |
| **Navigation** | Client/User/Transaction page loads, Tab switching |
| **CRUD Operations** | Create client/user, Update records, Delete records |
| **Forms** | Form submissions, Validation errors, Success redirects |
| **Search & Filter** | Transaction filters, Client search, User search |
| **Bulk Operations** | Multi-record actions, Batch updates |

### Output & Reports

**Console Output:**
```
[PERF] PASS | Login to Dashboard | 1234ms / 5000ms (24.7%)
[PERF] PASS | Create Client | 876ms / 5000ms (17.5%)
[PERF] FAIL | Load Transactions | 5234ms / 5000ms (104.7%)
```

**Artifacts:**
- **JSON:** `test-results/frontend-latency-results.json`
- **HTML:** `playwright-report/index.html`
- **Screenshots:** `test-results/` (on failure)
- **Videos:** `test-results/` (on failure, if enabled)

### CI Integration

**Workflow:** `.github/workflows/ci-frontend.yml`

**Steps:**
1. Run latency tests with `npm run test:e2e:latency`
2. Extract performance metrics from test output
3. Upload test results as artifacts (success or failure)
4. Fail build if any operation exceeds 5 seconds

**Viewing CI Results:**
1. Go to GitHub Actions workflow run
2. Download "frontend-latency-results" artifact
3. Extract and open `playwright-report/index.html`

### Troubleshooting

**Slow Tests:**
- Ensure backend is mocked (no real API calls)
- Check browser dev tools for slow resources
- Profile with `DEBUG=pw:api` environment variable

**Flaky Tests:**
- Use Playwright's built-in retry mechanism (configured in config)
- Check for timing issues in test code
- Verify mock responses match real API schema

**LocalStack Container Cleanup:**

Repeated runs leave stopped LocalStack Lambda containers:

```bash
# Clean all stopped containers
docker container prune

# Or target LocalStack specifically
docker ps -a | grep localstack-lambda | awk '{print $1}' | xargs docker rm

# See also: docs/infrastructure/localstack-setup.md#7-cleaning-up-leftover-lambda-containers
```

## Fullstack Integration Testing

### Entry Points

```bash
# Full integration E2E (Docker Compose + LocalStack + Playwright)
bash scripts/ci/run-fullstack-integration-e2e.sh

# Verification-specific smoke test (forces SES email provider)
bash scripts/ci/run-ingestion-verification-smoke.sh
```

### Test Phases

**Phase 1-4:** Infrastructure and data setup
1. Start Docker Compose stack
2. Apply database migrations
3. Seed baseline data
4. HTTP smoke tests (actuator health checks)

**Phase 5:** Playwright E2E
- Login flows
- Client CRUD operations
- User management
- Transaction queries
- Protected route validation

### Environment Configuration

**Verification Email Provider:**

`run-ingestion-verification-smoke.sh` forces `VERIFICATION_EMAIL_PROVIDER=ses` to test the Lambda feedback path (not skipped).

### Safety Checks

Before modifying database config files:

```bash
bash scripts/ci/guard-no-prod-db.sh
```

This prevents accidental production database connections in CI/test config files.

---

## Database Bootstrap

### Shared Postgres Orchestration

Standardized DB setup for all stateful services (`user`, `client`, `transaction`, `log`).

**Prerequisites:**

```bash
# Start infrastructure
docker compose -f docker-compose.localstack.yml up -d postgres localstack
```

### Common Operations

```bash
# 1. Apply migrations (safe to rerun, idempotent)
bash scripts/db/run-shared-postgres.sh migrate

# 2. Seed baseline data (admin user, test principals)
bash scripts/db/run-shared-postgres.sh seed

# 3. Verify schema state
bash scripts/db/run-shared-postgres.sh verify

# 4. Verify seed data
bash scripts/db/run-shared-postgres.sh verify-seed

# 5. Reset database (DROP ALL DATA)
bash scripts/db/run-shared-postgres.sh reset
bash scripts/db/run-shared-postgres.sh migrate
```

### Migration Details

- **Java services:** Flyway migrations in `src/main/resources/db/migration/`
- **Log service:** Python SQL migrations in `services/backend/log/app/migrations/`
- **Schema tracking:** `schema_migrations` table tracks applied migrations

### Seed Data

**Baseline principals created:**
- Admin user: `admin@crm.local` / `Scrooge@Bank2026!`
- Test agents and clients
- Sample transaction data (for testing)

**Idempotency:** Rerunning `seed` will not duplicate data (uses `INSERT ... ON CONFLICT`).

### CI Integration

`scripts/ci/run-fullstack-integration-e2e.sh` uses the same `migrate` and `seed` flow for reproducible test environments.

---

## Output Locations

### Functional Tests

```
build-logs/
├── test-all/
│   ├── <timestamp>/           # Step-by-step logs for each test layer
│   ├── last-run-summary.md    # Latest run summary (markdown)
│   └── last-run-summary.json  # Latest run summary (JSON)
├── test-backend/              # Backend-only test logs
├── test-frontend/             # Frontend-only test logs
└── test-terraform/            # Terraform validation logs
```

### Performance Tests

```
build-logs/
└── performance/
    ├── smoke-local/<timestamp>/
    │   ├── results.csv        # Raw JMeter data
    │   ├── report/index.html  # Interactive dashboard
    │   └── jmeter.log         # Execution log
    ├── baseline-local/<timestamp>/
    ├── 100-threads-local/<timestamp>/
    ├── stress-test-local/<timestamp>/
    └── full-suite/<timestamp>/
        ├── frontend-results/  # Playwright latency test results
        └── backend-results/   # JMeter backend test results
```

### Frontend Tests

```
services/frontend/crm-ui/
├── coverage/
│   └── index.html             # Unit test coverage report
├── test-results/
│   ├── frontend-latency-results.json
│   ├── <test-name>/           # Screenshots, videos (on failure)
│   └── *.xml                  # JUnit XML reports
└── playwright-report/
    └── index.html             # Playwright E2E test report
```

### Database & Integration

```
build-logs/
├── fullstack-integration/     # Fullstack E2E logs
├── db-migrations/             # Migration logs
└── db-seed/                   # Seed operation logs
```

---

## Related Documentation

### Testing

- **Performance testing:** `tests/performance/README.md`
- **JMeter integration:** See `scripts/performance/` for all test scenarios
- **Frontend latency:** See [Frontend E2E & Latency Testing](#frontend-e2e--latency-testing) section

### Infrastructure

- **Onboarding:** `docs/onboarding/new-dev-setup.md`
- **LocalStack setup:** `docs/infrastructure/localstack-setup.md`
- **AWS deployment:** `docs/infrastructure/aws-deployment-guide.md`

### Compliance & Audits

- **CS301 requirements:** `docs/diff/features-compliance/prompt_b_infrastructure.md`
- **Performance audit:** `docs/audits/performance-testing-readiness-audit.md`
- **API contracts:** `docs/api-contracts/`

### External Resources

- **JMeter:** https://jmeter.apache.org/usermanual/index.html
- **Playwright:** https://playwright.dev/
- **Spring Boot Testing:** https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing
- **Vitest:** https://vitest.dev/

---

## Troubleshooting

### Common Issues

**"Connection refused" errors:**
```bash
# Ensure stack is running
bash scripts/dev/stack-up.sh
curl http://127.0.0.1:18088/actuator/health
```

**Database connection errors:**
```bash
# Check Postgres is running
docker ps | grep postgres
docker logs <postgres-container-id>

# Restart database
docker compose -f docker-compose.localstack.yml restart postgres
```

**Port already in use:**
```bash
# Find process using port 18088
netstat -ano | findstr :18088    # Windows
lsof -i :18088                   # Linux/macOS

# Stop the process or change port in docker-compose
```

**LocalStack Lambda containers accumulating:**
```bash
# Clean stopped containers
docker container prune -f

# Or target LocalStack specifically
docker ps -a | grep localstack-lambda | awk '{print $1}' | xargs docker rm
```

**JMeter not found in PATH:**
```bash
# Verify JMeter installation
jmeter --version

# Add to PATH (Windows Git Bash)
echo 'export PATH="/c/ProgramData/chocolatey/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Test timeouts:**
- Increase timeout in test configuration
- Check Docker resource limits (CPU, memory)
- Verify no other heavy processes running

### Getting Help

**Generate diagnostic report:**
```bash
python scripts/pipelines/doctor.py
python scripts/pipelines/support_bundle.py
```

This creates `build-logs/support-bundle-<timestamp>.zip` with:
- System diagnostics
- Docker state
- Kubernetes cluster info (if applicable)
- Recent logs

**Check CI runs:**
- Compare local results with GitHub Actions runs
- Download CI artifacts for detailed logs
- Review workflow YAML for environment differences

---

## Quick Command Reference

```bash
# === Functional Testing ===
python scripts/pipelines/test_all.py                    # Full CI suite
python scripts/pipelines/test_backend.py                # Backend only
python scripts/pipelines/test_frontend.py               # Frontend only

# === Performance Testing ===
bash scripts/dev/run-perf-smoke.sh                      # Quick smoke test
bash scripts/dev/run-perf-full.sh                       # Full 100-thread test
bash scripts/dev/run-full-performance-suite.sh          # Complete suite

# === Frontend Testing ===
cd services/frontend/crm-ui
npm run test:e2e:latency                                # Latency tests
npm run e2e                                             # All E2E tests
npm run test:coverage                                   # Unit tests with coverage

# === Local Development ===
bash scripts/dev/stack-up.sh                            # Start stack
bash scripts/dev/stack-down.sh                          # Stop stack
bash scripts/db/run-shared-postgres.sh migrate          # Apply migrations
bash scripts/db/run-shared-postgres.sh seed             # Seed data

# === Integration Testing ===
bash scripts/ci/run-fullstack-integration-e2e.sh        # Full E2E
bash scripts/ci/run-ingestion-verification-smoke.sh     # Verification smoke

# === Diagnostics ===
python scripts/pipelines/doctor.py                      # System check
python scripts/pipelines/support_bundle.py              # Create support bundle
```

---

*Last updated: 2026-03-29*
