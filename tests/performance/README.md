# Performance Testing

This directory contains Apache JMeter test plans for validating CS301 project performance requirements:
- **100 concurrent agents** using client-service
- **Stress testing** to demonstrate system resilience
- **<5 second frontend latency** validation

---

## Prerequisites

### 1. Install Apache JMeter

**Download:**
```bash
# Download JMeter 5.6.3 or later
wget https://downloads.apache.org/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz
export PATH=$PATH:$(pwd)/apache-jmeter-5.6.3/bin
```

**Verify:**
```bash
jmeter --version
# Expected: Apache JMeter 5.6.3 or later
```

### 2. Start Local Dev Stack

```bash
# From repo root
bash scripts/dev/stack-up.sh
```

Wait until all services are healthy (nginx on http://127.0.0.1:18088).

---

## Test Plan Overview

### `agent-crud-workflow.jmx`

Simulates realistic agent workflow:
1. **Login** → Extract JWT token
2. **Create Client** → Extract clientId
3. **Get Client** → Verify client retrieval
4. **Create Account** → Link account to client
5. **List Transactions** → Query client transactions

**Assertions:**
- HTTP 200/201 response codes
- Response time <5s (per CS301 requirement)
- JWT token extraction success
- Dynamic ID extraction (no hardcoded values)

---

## Running Tests

### GUI Mode (Development/Debugging)

```bash
jmeter -t tests/performance/agent-crud-workflow.jmx
```

**Note:** Disable "View Results Tree" listener for high load tests (causes memory issues).

### Non-GUI Mode (Production/CI)

**Basic execution:**
```bash
jmeter -n -t tests/performance/agent-crud-workflow.jmx \
  -l build-logs/performance/results.csv \
  -e -o build-logs/performance/report
```

**With parameters:**
```bash
jmeter -n -t tests/performance/agent-crud-workflow.jmx \
  -Jthreads=100 \
  -Jrampup=60 \
  -Jloops=10 \
  -Jhost=127.0.0.1 \
  -Jport=18088 \
  -l build-logs/performance/results.csv \
  -e -o build-logs/performance/report
```

**Using properties file:**
```bash
jmeter -n -t tests/performance/agent-crud-workflow.jmx \
  -q tests/performance/config/test.properties \
  -l build-logs/performance/results.csv \
  -e -o build-logs/performance/report
```

---

## Test Parameters

Override via `-Jkey=value` command line flags:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `host` | `127.0.0.1` | Target host (use ALB DNS for AWS tests) |
| `port` | `18088` | Target port (80 for ALB, 18088 for local nginx) |
| `threads` | `100` | Number of concurrent threads (simulates concurrent agents) |
| `rampup` | `60` | Ramp-up period in seconds (gradual load increase) |
| `loops` | `10` | Number of iterations per thread |

---

## Test Scenarios

### 1. Baseline (Single Thread)

**Purpose:** Establish baseline performance metrics without concurrency.

```bash
bash scripts/performance/run-baseline.sh
```

**Expected Results:**
- Throughput: ~10 req/sec
- P95 latency: <500ms
- Error rate: 0%

### 2. Concurrent Load (100 Threads)

**Purpose:** Validate "100 concurrent agents" requirement.

```bash
bash scripts/performance/run-100-threads.sh
```

**Acceptance Criteria:**
- Error rate <1%
- P95 latency <5s
- System remains stable

### 3. Stress Test (200 Threads)

**Purpose:** Exceed capacity to observe failure modes and resilience.

```bash
bash scripts/performance/run-stress-test.sh
```

**Expected Observations:**
- Identify saturation point
- Document failure modes (errors, timeouts)
- Verify system recovery after load removal

### 4. AWS Validation

**Purpose:** Validate ECS autoscaling and ALB behavior.

```bash
# First, deploy to AWS Learner Lab:
# .\scripts\deploy-learnerlab.ps1

# Get ALB DNS from Terraform output:
cd platform/terraform
terraform output alb_dns_name

# Run test against ALB:
bash scripts/performance/run-jmeter-against-aws.sh <alb-dns-name>
```

---

## Results Analysis

### CSV Results

Located in: `build-logs/performance/<test-name>/results.csv`

**Key columns:**
- `timeStamp`: Request timestamp (Unix epoch ms)
- `elapsed`: Response time (ms)
- `label`: Sampler name (e.g., "POST /api/clients")
- `responseCode`: HTTP status code
- `success`: true/false
- `bytes`: Response size
- `Latency`: Time to first byte (ms)

### HTML Dashboard

Located in: `build-logs/performance/<test-name>/report/index.html`

**Includes:**
- APDEX (Application Performance Index)
- Response time percentiles (P50, P90, P95, P99)
- Throughput (requests/sec)
- Error rate (%)
- Response time over time graph
- Active threads over time graph

**Open in browser:**
```bash
# Windows
start build-logs/performance/<test-name>/report/index.html

# Linux/macOS
open build-logs/performance/<test-name>/report/index.html
```

---

## Interpreting Results

### Success Criteria (CS301 Requirements)

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Error Rate** | <1% | Must be <5% |
| **P95 Response Time** | <2s | Must be <5s (requirement) |
| **Throughput** | ≥10 req/sec at 100 threads | System-dependent |
| **System Stability** | No crashes | Must remain operational |

### Common Failure Modes

1. **Database Connection Pool Exhaustion**
   - Symptom: HTTP 500 errors, "timeout acquiring connection"
   - Solution: Increase HikariCP pool size, tune Postgres max_connections

2. **Memory Pressure**
   - Symptom: Increasing response times, eventual OOM crashes
   - Solution: Increase JVM heap size, tune GC settings

3. **Log Service Bottleneck**
   - Symptom: High latency on create/update operations
   - Solution: Make log service calls async, add circuit breaker

4. **SNS Publish Rate Limit**
   - Symptom: Errors on audit event publishing (local: LocalStack limits, AWS: SNS quotas)
   - Solution: Batch events, implement retry with backoff

---

## Troubleshooting

### JMeter Errors

**Error: "Connection refused"**
- Ensure local stack is running: `bash scripts/dev/stack-up.sh`
- Verify nginx is listening on port 18088: `curl http://127.0.0.1:18088/actuator/health`

**Error: "TOKEN_NOT_FOUND" or "CLIENT_ID_NOT_FOUND"**
- Check JSON extractor paths match actual response structure
- Enable "View Results Tree" listener in GUI mode to inspect responses
- Verify admin credentials: `admin@crm.com` / `Scrooge@Bank2026!`

**Error: "OutOfMemoryError" during high load**
- Increase JMeter heap: `export HEAP="-Xms1g -Xmx4g"`
- Disable "View Results Tree" listener (only use Summary/Aggregate)
- Use non-GUI mode for load tests

### Stack Issues

**Postgres connection errors**
- Check Postgres is healthy: `docker ps | grep postgres`
- View Postgres logs: `docker logs <postgres-container-id>`
- Check connection count: `docker exec -it <postgres-container> psql -U crm_app -d crm -c "SELECT count(*) FROM pg_stat_activity;"`

**Backend service failures**
- Check service health: `curl http://127.0.0.1:18088/api/clients/actuator/health`
- View service logs: `docker logs <client-service-container-id>`
- Restart stack: `bash scripts/dev/stack-down.sh && bash scripts/dev/stack-up.sh`

---

## Best Practices

1. **Always run baseline first** - Establishes known-good metrics before high load
2. **Ramp up gradually** - Use ramp-up period to avoid sudden load spikes
3. **Monitor system metrics** - Watch Docker stats, Postgres connections during tests
4. **Disable GUI listeners for load tests** - Use non-GUI mode for >10 threads
5. **Clean state between tests** - Restart stack to ensure reproducible results
6. **Document all results** - Capture metrics, screenshots, system state
7. **Version control test configs** - Tag results with git commit SHA for regression tracking

---

## CI/CD Integration (Future)

**Planned GitHub Actions workflow:**
```yaml
# .github/workflows/ci-performance.yml
name: Performance Tests
on: [pull_request]
jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - name: Start local stack
        run: bash scripts/dev/stack-up.sh
      - name: Run baseline test
        run: bash scripts/performance/run-baseline.sh
      - name: Assert thresholds
        run: |
          # Parse CSV, fail if p95 >5s or error rate >1%
          python scripts/ci/validate-performance-results.py
```

---

## References

- **CS301 Requirements:** `docs/diff/features-compliance/prompt_b_infrastructure.md`
- **Performance Audit:** `docs/audits/performance-testing-readiness-audit.md`
- **Backlog:** `docs/audits/performance-testing-backlog.md`
- **JMeter Documentation:** https://jmeter.apache.org/usermanual/index.html
- **API Contracts:** `docs/api-contracts/`

---

## Support

**Issues:**
- Local setup: See `docs/troubleshooting.md`
- AWS deployment: See `docs/infrastructure/aws-deployment-guide.md`
- Performance questions: Review audit documents in `docs/audits/`
