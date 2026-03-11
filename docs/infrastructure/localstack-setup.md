# LocalStack Local Development Setup

This guide covers installing and wiring LocalStack for local development of the
ScroogeBank CRM event-driven pipeline (SQS → Lambda → DynamoDB → S3 → SNS/SES).

**What runs in LocalStack:** SQS, DynamoDB, S3, Lambda, SNS, Secrets Manager  
**What runs natively:** PostgreSQL (Docker), Spring Boot services (docker-compose or IDE), React frontend  
**Log API runtime in local/CI:** LocalStack API Gateway -> log Lambda (no dedicated log-service container)  
**What is skipped locally:** VPC, NAT Gateway, ALB, CloudFront, WAF, ACM, Route53, CloudTrail, ECS Fargate

---

## Prerequisites

- Docker Desktop installed and running
- Python 3.11+ (for Lambda functions and `awslocal` CLI)
- AWS CLI installed (`aws --version`)
- Java 17+ and Gradle (for agent/client/transaction services)

---

## 1. Install LocalStack

### Option A — Docker (recommended, no install needed)

```bash
docker pull localstack/localstack:4
```

### Option B — LocalStack CLI

```bash
pip install localstack
localstack --version
```

### Install `awslocal` (wrapper CLI that points to LocalStack)

```bash
pip install awscli-local
awslocal --version
```

---

## 2. Start LocalStack

A `docker-compose.localstack.yml` is provided at the project root:

```bash
# Start LocalStack + PostgreSQL
docker compose -f docker-compose.localstack.yml up -d

# Start only LocalStack (without PostgreSQL)
docker compose -f docker-compose.localstack.yml up -d localstack
```

Verify LocalStack is healthy:

```bash
curl http://localhost:4566/_localstack/health
# Expected: {"services": {"sqs": "running", "dynamodb": "running", ...}}
```

---

## 3. Auto-provision Resources on Startup

`platform/localstack/init/01-setup.sh` is mounted into the LocalStack container
at `/etc/localstack/init/ready.d/` and runs automatically once LocalStack is
healthy. It creates:

| Resource | Type | Name |
|---|---|---|
| scroogebank-crm-dev-audit | SQS queue | Audit event ingestion |
| scroogebank-crm-dev-audit-dlq | SQS queue | Audit dead-letter queue |
| scroogebank-crm-dev-aml | SQS queue | AML event ingestion |
| scroogebank-crm-dev-aml-dlq | SQS queue | AML dead-letter queue |
| scroogebank-crm-dev-audit-logs | DynamoDB table | Audit log storage |
| scroogebank-crm-dev-aml-reports | DynamoDB table | AML report storage |
| scroogebank-crm-dev-frontend | S3 bucket | Frontend static assets |
| scroogebank-crm-dev-verification | S3 bucket | Verification documents |
| scroogebank-crm-dev-verification | SNS topic | Verification notifications |
| scroogebank-crm-dev/db_username | Secret | PostgreSQL username |
| scroogebank-crm-dev/db_password | Secret | PostgreSQL password |
| scroogebank-crm-dev/jwt_hmac | Secret | JWT signing secret |
| scroogebank-crm-dev/root_admin_password | Secret | Root admin password |

Make the init script executable (required once after cloning):

```bash
# Linux/macOS
chmod +x platform/localstack/init/01-setup.sh

# Windows (Git Bash) — persists the executable bit in git
git update-index --chmod=+x platform/localstack/init/01-setup.sh
```

---

## 4. Configure AWS CLI to Point at LocalStack

Add a named profile so you do not pollute your real AWS credentials:

```bash
aws configure --profile localstack
# AWS Access Key ID:     test
# AWS Secret Access Key: test
# Default region:        ap-southeast-1
# Output format:         json
```

Use it via flag or environment variable:

```bash
# Per-command
aws --profile localstack --endpoint-url http://localhost:4566 sqs list-queues

# Export for the session
export AWS_PROFILE=localstack
export AWS_ENDPOINT_URL=http://localhost:4566

# Or use awslocal (handles the endpoint automatically)
awslocal sqs list-queues
```

---

## 5. Configure Python Lambda Functions for LocalStack

The Python Lambdas use `boto3`. Set these environment variables before running locally:

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_ENDPOINT_URL=http://localhost:4566
```

For `boto3` clients, pass `endpoint_url` via environment (backward-compatible — unset in production):

```python
import os, boto3

endpoint = os.environ.get("AWS_ENDPOINT_URL")  # None in prod

sqs = boto3.client("sqs", endpoint_url=endpoint)
dynamodb = boto3.resource("dynamodb", endpoint_url=endpoint)
secretsmanager = boto3.client("secretsmanager", endpoint_url=endpoint)
```

---

## 6. Configure Spring Boot Services for LocalStack

Add `src/main/resources/application-local.yml` to each Java service:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/crm
    username: crm_app
    password: devpassword

cloud:
  aws:
    credentials:
      access-key: test
      secret-key: test
    region:
      static: ap-southeast-1
    sqs:
      endpoint: http://localhost:4566
```

Run services with the `local` profile:

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

---

## 7. Deploy the Log Lambda to LocalStack for Testing

```bash
cd services/backend/log

# Build zip package (dependencies + app code)
rm -rf package log-lambda.zip
mkdir -p package
pip install -r requirements.txt -t package
cp lambda_function.py package/
cp -R app package/app
(cd package && zip -rq ../log-lambda.zip .)

# Deploy to LocalStack
awslocal lambda create-function \
  --function-name scroogebank-crm-dev-log-service \
  --runtime python3.13 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://log-lambda.zip \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --environment "Variables={AWS_ENDPOINT_URL=http://localhost:4566,DB_HOST=host.docker.internal,DB_PORT=5432,DB_NAME=crm}"

# Invoke it
awslocal lambda invoke \
  --function-name scroogebank-crm-dev-log-service \
  --payload '{"test": true}' \
  /tmp/response.json

cat /tmp/response.json
```

---

## 8. Verify the Full Pipeline Locally

```bash
# 1. Send a message to the audit queue
awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/scroogebank-crm-dev-audit \
  --message-body '{"eventType":"LOGIN","userId":"user-123","timestamp":"2026-03-09T00:00:00Z"}'

# 2. Check DynamoDB (after audit_consumer Lambda processes it)
awslocal dynamodb scan --table-name scroogebank-crm-dev-audit-logs
```

---

## 9. Useful Commands

```bash
awslocal sqs list-queues
awslocal dynamodb list-tables
awslocal s3 ls
awslocal secretsmanager list-secrets
awslocal lambda list-functions

# View LocalStack logs
docker logs -f localstack

# Restart LocalStack (re-runs init scripts)
docker compose -f docker-compose.localstack.yml restart localstack

# Full teardown and re-provision
docker compose -f docker-compose.localstack.yml down -v
docker compose -f docker-compose.localstack.yml up -d
```

---

## 10. CI/CD Integration

LocalStack is validated in CI as part of the **fullstack integration test** in
both `ci-main.yml` and `ci-integration.yml`. It is not a separate pipeline stage.

Pipeline position:

```
changes -> lint -> test-* (parallel) -> e2e-frontend-mocked -> fullstack-integration-e2e -> [deploy: not yet implemented]
```

**Run the fullstack-integration-e2e tests in Git Bash (use linux instead of powershell)**

The reusable workflow is at `.github/workflows/reusable-fullstack-integration.yml`.
The CI script is at `scripts/ci/run-fullstack-integration-e2e.sh`.

The fullstack integration test handles LocalStack as part of a broader test that:
1. Builds all Java service JARs and required Docker images
2. Starts base infra containers (`localstack`, `postgres`) via `scripts/ci/fullstack-integration.compose.yml`
3. Provisions log-service as a LocalStack Lambda + HTTP API and waits for readiness
4. Starts application services and integration gateway
5. Runs cross-service HTTP smoke assertions (client-service -> log-service Lambda API, transaction-service, SQS round-trip)
6. Runs real Playwright E2E tests against the live stack

### Expected Runtime / CI Minutes (Guideline)

Reference baseline from the latest successful **local full run** (`test_all.py`,
March 11, 2026), from:
- `build-logs/test-all/last-run-summary.md`
- `build-logs/test-all/last-run-summary.json`

| Scope | Time |
|---|---:|
| Fullstack integration layer (`Layer 4 - Fullstack Integration E2E`) | 171.1s (~2.9 min) |
| Entire local CI-equivalent pipeline (`test_all.py`, full mode) | 523.8s (~8.7 min) |

Use this as a planning baseline for GitHub Actions minutes:
- Fullstack test step (`bash scripts/ci/run-fullstack-integration-e2e.sh`) is usually
  slower in GitHub Actions than local due to runner variability and environment startup.
- Pull requests run `smoke` mode, so runtime is usually lower than `full` mode.
- Timeout ceilings are intentionally higher than typical runtime: `35` minutes for the test step and `50` minutes for the full job (`.github/workflows/reusable-fullstack-integration.yml`).
- Transient startup lines like `curl: (56) Recv failure: Connection reset by peer` can occur during readiness polling; treat as non-fatal if subsequent `[ready]` checks pass.

### Local debugging script

A standalone LocalStack-only smoke script is available for local debugging when
you want to verify the init script provisions resources correctly without
standing up the full service stack:

```bash
bash scripts/ci/run-localstack-smoke.sh
```

This starts only the `localstack` service from `docker-compose.localstack.yml`,
waits for provisioning, asserts every SQS queue, DynamoDB table, S3 bucket, SNS
topic, and Secret exists, then runs an SQS round-trip. It tears down LocalStack
on exit. It is **not** wired into the CI pipeline.

---

## 11. What to Skip in LocalStack

| Resource | Local substitute |
|---|---|
| NAT Gateway / VPC | Not needed — services talk directly on localhost |
| ALB | Run services on local ports (`localhost:8080`, `localhost:8081`, …) |
| CloudFront | Serve frontend with `npm run dev` or `vite` |
| WAF | Not testable locally |
| ECS Fargate | Run containers via docker-compose |
| ACM / Route53 | Use `localhost` or `/etc/hosts` aliases |
| RDS (Multi-AZ) | Use `postgres:16-alpine` Docker container |
| CloudTrail | Skip — audit covered by DynamoDB `audit-logs` table |

---

## Reference

- LocalStack docs: https://docs.localstack.cloud
- `awslocal` CLI: https://github.com/localstack/awscli-local
- LocalStack Docker image: https://hub.docker.com/r/localstack/localstack

