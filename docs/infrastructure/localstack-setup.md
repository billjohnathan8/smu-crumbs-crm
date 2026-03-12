# LocalStack Setup

This project uses LocalStack for local integration workflows.

LocalStack emulates AWS services used by the stack (SQS, DynamoDB, S3, Lambda, SNS, SES, Secrets Manager).

## Prerequisites

- Docker running
- Python 3.12+
- AWS CLI (optional but useful)

## 1. Start LocalStack + Postgres

```bash
docker compose -f docker-compose.localstack.yml up -d
```

Health check:

```bash
curl http://localhost:4566/_localstack/health
```

## 2. Resource Bootstrap

`platform/localstack/init/01-setup.sh` is auto-run by LocalStack on startup.
It provisions baseline queues, tables, buckets, topic, and secrets used by local flows.

## 3. Optional CLI Access

Install `awslocal`:

```bash
pip install awscli-local
awslocal sqs list-queues
```

## 4. Run Fullstack Integration (Recommended)

```bash
bash scripts/ci/run-fullstack-integration-e2e.sh
```

This script handles service startup, log Lambda/API provisioning, smoke checks, and integration Playwright tests.

## 5. Teardown

```bash
docker compose -f docker-compose.localstack.yml down -v
```

## Troubleshooting

- If startup fails, inspect `docker compose logs localstack`.
- If fullstack tests fail, inspect `build-logs/fullstack-integration/`.
