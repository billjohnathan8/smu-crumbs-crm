[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA Scroogebank Enterprise CRM
![AWS](https://img.shields.io/badge/AWS-Cloud%20Native-orange)
![Microservices](https://img.shields.io/badge/Architecture-Microservices-yellow)
![React](https://img.shields.io/badge/Frontend-React-63e5ff)
![Java](https://img.shields.io/badge/Backend-Springboot-green)
![Python](https://img.shields.io/badge/Backend-Python%20-006666)
![Terraform](https://img.shields.io/badge/IaC-Terraform-purple)
> A cloud-native, microservices-based, and enterprise Customer Relationship Management (CRM) system for Scrooge Global Bank – developed as the flagship project for CS301 IT Solution Architecture (ITSA).

# Evaluation Guide
Submission-oriented quick guide for evaluators and deployers.

This README contains the two required instruction sets from the CS301 rubric:
1. Testing the current setup.
2. Recreating/deploying the solution in another region.

## 1. Project Overview

Scroogebank CRM is a cloud-native system with:
- Frontend: React/TypeScript (`services/frontend/crm-ui`)
- Backend: Spring Boot services (`services/backend/user`, `services/backend/client`, `services/backend/transaction`)
- Supporting Lambdas and pipelines (Python)
- Infrastructure as code: Terraform (`platform/terraform`)

Current region profiles in repo:
- Shared integration/prod profiles: Singapore (`ap-southeast-1`) in `platform/terraform/env/integration.tfvars` and `platform/terraform/env/prod.tfvars`
- Learner Lab profile: `us-east-1` in `platform/terraform/env/lab.tfvars`

## Tech Stack

### Programming Languages

- Java 21
- Python (3.13 in CI workflows; 3.12+ in local prerequisites)
- TypeScript 5.x
- JavaScript (Node.js 20 in CI workflows)
- SQL (schema and migration scripts)
- HCL (Terraform)
- YAML (GitHub Actions, Docker Compose)
- Bash and PowerShell scripting

### Frontend (Presentation Layer)

- React 19 + React DOM
- React Router
- Recharts
- Vite + `@vitejs/plugin-react`
- Tailwind CSS + PostCSS + Autoprefixer

### Backend (Application Layer)

- Spring Boot services (user, client, transaction)
- Spring Security
- Spring Data JPA
- Flyway (Spring-integrated migrations)
- SpringDoc OpenAPI (Swagger UI)
- Spring Cloud AWS (S3 integration)
- AWS SDK for Java v2
- Python Lambda services and workers using Boto3, Pydantic, Paramiko, Psycopg, and Cryptography

### Data, Storage, and Persistence

- PostgreSQL (Amazon RDS in cloud; Postgres 16 in local Docker)
- H2 (test runtime for Spring services)
- Amazon DynamoDB
- Amazon S3
- Flyway migration pipelines for relational schemas

### Messaging and Integration

- Amazon SQS
- Amazon SNS
- Amazon EventBridge
- Amazon API Gateway
- Amazon SES
- Amazon Cognito
- SFTP ingestion flow (EC2-hosted OpenSSH server + Paramiko client)

### Infrastructure and Cloud (AWS)

- Terraform (`>= 1.10`) as Infrastructure as Code
- OpenTofu validate checks in CI
- Amazon VPC (subnets, route tables, NACLs, Internet Gateway, NAT Gateway, flow logs)
- Amazon ECS on Fargate
- AWS Lambda
- Amazon ECR
- Application Load Balancer (ALB)
- Amazon CloudFront
- AWS WAF
- Amazon Route 53
- AWS Certificate Manager (ACM)
- AWS Secrets Manager and SSM Parameter Store
- AWS Backup
- AWS CodeDeploy
- LocalStack for local AWS service emulation

### DevOps, CI/CD, and Build Tooling

- GitHub Actions
- Gradle
- npm
- pip
- Docker and Docker Compose
- Make
- jq (deployment and output parsing scripts)

### Testing, Quality, and Security Tooling

- JUnit + Mockito + Testcontainers (Java)
- pytest + pytest-cov (Python)
- Vitest + Testing Library + MSW (frontend)
- Playwright (integration and end-to-end)
- Checkstyle (Java)
- ESLint + Prettier + TypeScript type checking (frontend)
- Black + Flake8 (Python)
- TFLint + Checkov + Trivy (Terraform/IaC security and policy checks)
- pip-audit + npm audit + Bandit (dependency and SAST scanning)
- Gitleaks + TruffleHog (secret scanning)
- Spectral (OpenAPI linting)
- JaCoCo and V8-based coverage reports

### Observability and Operations

- Amazon CloudWatch (logs, metrics, alarms, dashboards)
- AWS CloudTrail
- AWS GuardDuty
- ECS Container Insights
- Infracost (cost estimation in CI when configured)

## System Architecture
![Architecture Diagram](docs\main-diagrams\main-aws-architecture-diagram-dark-mode.png)

## Key Components
**Frontend:** React SPA deployed to S3 with Cloudfront CDN

**Authentication:** AWS COgnito wiht OAuth2.0

**Core Services:**
- AML Reporting (Lambda)
- Client Management (ECS Fargate)
- Audit Logging (Lambda + DynamoDB)
- SFTP Transaction Collector (Lambda + S3)
- Transaction Management (ECS Fargate)
- Agent User Management (ECS Fargate)

**Secondary Services:**
- AML Consumer (Lambda)
- Audit Consumer (Lambda)
- Verification (Lambda + Cloudfront + Cognito)

**Data Layer:**
- PostgreSQL with Amazon RDS for ECS Fargate services 
- DynamoDB for NoSQL Data used for Audit Logs

**Infrastructure:**
- Provisioned with Terraform
- Multi-AZ Deployments with Auto-Scaling Groups & ALB

## 2. Evaluator Quick Start - Current Setup (Instruction Set A)

### What To Test

Use the local stack for deterministic evaluation (no cloud dependency required).

### Current Testable Environments and URLs

| Environment | Purpose | URL / How to get URL |
|---|---|---|
| Local stack | Primary evaluator flow | `http://127.0.0.1:18088` |
| Local health checks | API readiness | `http://127.0.0.1:18088/api/user/health`, `http://127.0.0.1:18088/api/clients/health`, `http://127.0.0.1:18088/api/transactions/health` |
| Terraform-managed AWS env (if already deployed) | Cloud smoke check | `terraform -chdir=platform/terraform output -raw app_url` |

Project-specific deployed domain: fill from actual Terraform output (`app_url`); do not invent.

### Required Usernames

- `admin@crm.com`
- `agent1@crm.com`

Passwords are documented only in the project report and must not appear in this README.

### Minimal Evaluator Checklist (Safe Sample Values)

1. Prepare local env and start stack.
```bash
cp .env.example .env.local
bash scripts/dev/stack-up.sh
```
2. Open `http://127.0.0.1:18088` and sign in as `admin@crm.com`.
3. Sign in as `agent1@crm.com` in a separate session.
4. Create a client using safe sample values (aligned with integration test fixtures):
   - First name: `Client`
   - Last name: `Record`
   - Date of birth: `1990-01-01`
   - Email: `eval.client.001@example.test`
   - Phone: `+6591234567`
   - Address: `100 Integration Street`, `Singapore`, `Singapore`, `123456`
5. Create an account for that client:
   - Account type: `Savings`
   - Status: `Active`
   - Initial deposit: `1000`
   - Currency: `SGD`
   - Branch ID: `SG-001`
6. Verify health endpoints return `200`.
```bash
curl http://127.0.0.1:18088/api/user/health
curl http://127.0.0.1:18088/api/clients/health
curl http://127.0.0.1:18088/api/transactions/health
```

## 3. Local Developer Setup

### Prerequisites

- Git
- Docker Desktop / Docker Engine
- Java 21
- Node.js 22+
- Python 3.12+
- Terraform (needed for infra workflows)

### Required Local Config

Create `.env.local` from `.env.example` and set:
- `LOCAL_DB_PASSWORD`
- `JWT_HMAC_SECRET`
- `E2E_ADMIN_PASSWORD`
- `E2E_USER_PASSWORD`

### Core Commands

```bash
# setup helpers
python scripts/pipelines/setup_dev_env.py

# local stack
bash scripts/dev/stack-up.sh
bash scripts/dev/stack-down.sh

# full local test pipeline
python scripts/pipelines/test_all.py

# full local CI Pipeline (to substitute GitHub Actions)
$env:INFRACOST_API_KEY=<insert-infracost-api-key-here>; $env:TERRAFORM_ENV="prod"; python scripts/pipelines/test_all.py --suite all --fullstack-mode full --performance-mode full-with-recovery --performance-repeats 3 --performance-max-error-rate-pct 1.0 --performance-max-p95-ms 5000 --fail-fast;
```

## 4. Deployment / Recreation In Another Region (Instruction Set B)

Example target: Hong Kong (`ap-east-1`).

### Prerequisites

- AWS CLI authenticated to target account
- Terraform CLI
- Docker
- Java 21
- Node.js 22+
- `jq`

### Required Configuration Inputs

1. Create region-specific backend and tfvars files.
```bash
cp platform/terraform/env/integration.backend.hcl platform/terraform/env/hk.backend.hcl
cp platform/terraform/env/integration.tfvars platform/terraform/env/hk.tfvars
```
2. Edit `platform/terraform/env/hk.backend.hcl`:
   - `region`
   - `bucket`
   - `dynamodb_table`
   - `key` path (environment segment)
3. Edit `platform/terraform/env/hk.tfvars`:
   - `environment`
   - `aws_region`
   - `user_image_tag`, `client_image_tag`, `transaction_image_tag`
   - any owned domain/email/certificate settings used by your target environment
4. Export required sensitive vars (do not commit):
```bash
export TF_VAR_jwt_hmac_secret="<secure-random-32+-char-secret>"
export TF_VAR_root_admin_password="<strong-password>"
```
5. If verification pipeline is enabled and no domain is set, provide `verification_frontend_base_url` (as noted in `integration.tfvars` / `prod.tfvars`).

### Infra Provision Steps (Exact Commands)

Create remote state resources once (adjust names/region):

```bash
aws s3api create-bucket --bucket <your-tf-state-bucket> --region <target-region> --create-bucket-configuration LocationConstraint=<target-region>
aws s3api put-bucket-versioning --bucket <your-tf-state-bucket> --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name <your-tf-lock-table> --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region <target-region>
```

Initialize and create ECR repos first (same sequence used in deploy scripts):

```bash
terraform -chdir=platform/terraform init -reconfigure -backend-config=env/hk.backend.hcl
terraform -chdir=platform/terraform apply -target=module.ecr -var-file=env/hk.tfvars -auto-approve
```

### App Deployment Steps (Exact Commands)

Resolve Terraform outputs:

```bash
TF_JSON="$(terraform -chdir=platform/terraform output -json)"
USER_REPO="$(jq -r '.ecr_repository_urls.value.user' <<<"$TF_JSON")"
CLIENT_REPO="$(jq -r '.ecr_repository_urls.value.client' <<<"$TF_JSON")"
TX_REPO="$(jq -r '.ecr_repository_urls.value.transaction' <<<"$TF_JSON")"
FRONTEND_BUCKET="$(jq -r '.frontend_bucket_name.value' <<<"$TF_JSON")"
CLOUDFRONT_ID="$(jq -r '.cloudfront_distribution_id.value // empty' <<<"$TF_JSON")"
ECR_REGISTRY="${USER_REPO%%/*}"
```

Build and push backend images (tags must match `hk.tfvars`):

```bash
# user
(cd services/backend/user && ./gradlew clean bootJar -x test --no-daemon --console=plain)
docker build -t "$USER_REPO:<user-image-tag>" services/backend/user

# client
(cd services/backend/client && ./gradlew clean bootJar -x test --no-daemon --console=plain)
docker build -t "$CLIENT_REPO:<client-image-tag>" services/backend/client

# transaction
(cd services/backend/transaction && ./gradlew clean bootJar -x test --no-daemon --console=plain)
docker build -t "$TX_REPO:<transaction-image-tag>" services/backend/transaction

aws ecr get-login-password --region <target-region> | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker push "$USER_REPO:<user-image-tag>"
docker push "$CLIENT_REPO:<client-image-tag>"
docker push "$TX_REPO:<transaction-image-tag>"
```

Apply full infra (now that images exist in ECR):

```bash
terraform -chdir=platform/terraform plan -var-file=env/hk.tfvars -out=tfplan-hk
terraform -chdir=platform/terraform apply tfplan-hk
```

Deploy frontend assets:

```bash
cd services/frontend/crm-ui
npm ci
npm run build
aws s3 sync dist/ "s3://$FRONTEND_BUCKET/live/" --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$FRONTEND_BUCKET/live/index.html" --cache-control "no-store,no-cache,must-revalidate,max-age=0" --content-type "text/html"
if [ -n "$CLOUDFRONT_ID" ]; then aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*"; fi
```

### Region-Specific Changes (Singapore -> Another Region)

- Update `aws_region` in your tfvars file.
- Update backend `region` and backend resource names in your backend HCL file.
- Recreate regional resources (ECR/ECS/RDS/Lambda/etc.) in target region.
- Use target-region-owned sender/domain/cert settings (for example SES sender identity, Route53/ACM records).

### Manual Steps If Automation Is Incomplete

- `scripts/deploy/deploy-aws.ps1` only supports `lab`, `integration`, `prod`. For custom env names (for example `hk`), use Terraform CLI commands directly.
- Post-apply seeding (`scripts/ci/bootstrap-post-apply.sh`) requires manual secrets at runtime:
  - `ROOT_ADMIN_PASSWORD`
  - `SEED_USER_TEMP_PASSWORD` (if user seeding is enabled)
- For SFTP verification, provide a real SSH private key and explicit runtime args to `scripts/ci/verify-prod-sftp-transaction-flow.ps1`.

### Post-Deploy Validation Checks

```bash
terraform -chdir=platform/terraform output -raw app_url
terraform -chdir=platform/terraform output -raw alb_dns_name
```

Health checks (replace with your ALB DNS output):

```bash
curl "http://<alb-dns-name>/api/user/health"
curl "http://<alb-dns-name>/api/clients/health"
curl "http://<alb-dns-name>/api/transactions/health"
```

Optional seed/bootstrap command:

```bash
API_BASE_URL="<terraform-output-app-url>" ROOT_ADMIN_PASSWORD="<root-admin-password>" SEED_USER_TEMP_PASSWORD="<temp-user-password>" bash scripts/ci/bootstrap-post-apply.sh
```

### Teardown / Cost Note

Supported env names via script:
- `./scripts/deploy/deploy-aws.ps1 -Env lab -Destroy`
- `./scripts/deploy/deploy-aws.ps1 -Env integration -Destroy`
- `./scripts/deploy/deploy-aws.ps1 -Env prod -Destroy`

Custom env names (example `hk`):

```bash
terraform -chdir=platform/terraform destroy -var-file=env/hk.tfvars
```

## 5. Troubleshooting

- Stack startup failure: `bash scripts/dev/stack-down.sh` then `bash scripts/dev/stack-up.sh`.
- Missing env values: verify `.env.local` contains all keys from `.env.example`.
- Terraform backend init errors: verify bucket/table/region values in `env/*.backend.hcl` and ensure backend resources exist.
- App deployment issues after apply: confirm `terraform output -json` includes `ecr_repository_urls` and `frontend_bucket_name`.

## 6. Attribution of AI
Artificial Intelligence (in the form of consultation, auditing, and coding agents were used in this project). The core responsibilities and domains of AI usage for this project are:
- Generating Documentation & Artifacts
- Generating some amount of Unit Test Cases
- Auditing the Repository
- Correcting Linting & Styling Errors on service code
- Generating & Running Local Scripts and Tooling (notably the Local CI Pipeline `test_all.py`)

Core Models Used:
- ChatGPT 5.0
- OpenAI Codex
- Claude Code
- GitHub Copilot

## 7. Links To Detailed Docs

For evaluators who want deeper implementation detail and deployment evidence, use the grouped links below.

### Core Setup and Operations Docs

- Testing guide: [docs/testing/TESTING-GUIDE.md](docs/testing/TESTING-GUIDE.md)
- LocalStack setup: [docs/infrastructure/localstack-setup.md](docs/infrastructure/localstack-setup.md)
- Terraform workflow: [docs/infrastructure/terraform-infra-workflow.md](docs/infrastructure/terraform-infra-workflow.md)
- Terraform remote state: [docs/infrastructure/terraform-remote-state.md](docs/infrastructure/terraform-remote-state.md)
- DB/env config: [docs/database_configuration.md](docs/database_configuration.md)
- Troubleshooting guide: [docs/troubleshooting.md](docs/troubleshooting.md)
- Docs index: [docs/README.md](docs/README.md)
- Coding standards: [docs/coding-standards/coding-standards.md](docs/coding-standards/coding-standards.md)
- Frontend documentation: [docs/frontend/README.md](docs/frontend/README.md)

### Evidence Artifacts (Generated Reports and Logs)

- AWS infrastructure map: [docs/artifacts/aws-infrastructure-map.md](docs/artifacts/aws-infrastructure-map.md)
- Terraform inventory snapshot: [docs/artifacts/terraform-inventory.md](docs/artifacts/terraform-inventory.md)
- Cost estimate artifact: [docs/artifacts/cost-estimate.md](docs/artifacts/cost-estimate.md)
- Production bug diagnosis report: [build-logs/PRODUCTION-BUG-DIAGNOSIS.md](build-logs/PRODUCTION-BUG-DIAGNOSIS.md)
- Latest local test-result marker: [test-results/.last-run.json](test-results/.last-run.json)

### Test Implementation References

- Integration test suite notes: [tests/integration/README.md](tests/integration/README.md)
- Performance test suite notes: [tests/performance/README.md](tests/performance/README.md)
- Local CI orchestration script: [scripts/pipelines/test_all.py](scripts/pipelines/test_all.py)
- To generate a map of our infrastructure, refer to cs301-brainboard-test submodule.

# Team
CS301 G2T3 - CRUMBS:
BILL JOHNATHAN
DENISE LIE
TOH DE XUE
BERNARDINUS MATTEO WOENARDI
PEH SIEW YU
TANIA LEE GUNAWAN
VERDIO WONG

---
This project was completed as part of CS301 IT Systems Architecture at Singapore Management University. The implementation reflects real-world enterprise architecture principles and modern cloud development practices.