# Tech Stack
[![HTML](https://img.shields.io/badge/HTML-%23E34F26.svg?logo=html5&logoColor=white)](#)
[![CSS](https://img.shields.io/badge/CSS-639?logo=css&logoColor=fff)](#)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](#)
[![Java](https://img.shields.io/badge/Java-%23ED8B00.svg?logo=openjdk&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=fff)](#)
[![Postgres](https://img.shields.io/badge/Postgres-%23316192.svg?logo=postgresql&logoColor=white)](#)
[![Bash](https://img.shields.io/badge/Bash-4EAA25?logo=gnubash&logoColor=fff)](#)
[![PowerShell](https://custom-icon-badges.demolab.com/badge/PowerShell-5391FE?logo=powershell-white&logoColor=fff)](#)
[![JSON](https://img.shields.io/badge/JSON-000?logo=json&logoColor=fff)](#)
[![YAML](https://img.shields.io/badge/YAML-CB171E?logo=yaml&logoColor=fff)](#)

This section contains our tech stack and prerequisites you will require before starting.

## Overview
Scroogebank CRM is a cloud-native system with:
- Frontend: React/TypeScript (`services/frontend/crm-ui`)
- Backend: Spring Boot services (`services/backend/user`, `services/backend/client`, `services/backend/transaction`)
- Supporting Lambdas and pipelines (Python)
- Infrastructure as code: Terraform (`platform/terraform`)

Current region profiles in repo:
- Shared integration/prod profiles: Singapore (`ap-southeast-1`) in `platform/terraform/env/integration.tfvars` and `platform/terraform/env/prod.tfvars`
- Learner Lab profile: `us-east-1` in `platform/terraform/env/lab.tfvars`

## Programming Languages

- Java 21
- Python (3.12+ in CI workflows; 3.12+ in local prerequisites)
- TypeScript 5.x
- JavaScript (Node.js 20 in CI workflows)
- SQL (schema and migration scripts)
- HCL (Terraform)
- YAML (GitHub Actions, Docker Compose)
- Bash and PowerShell scripting

## Frontend (Presentation Layer)

- React 19 + React DOM
- React Router
- Recharts
- Vite + `@vitejs/plugin-react`
- Tailwind CSS + PostCSS + Autoprefixer

## Backend (Application Layer)

- Spring Boot services (user, client, transaction)
- Spring Security
- Spring Data JPA
- Flyway (Spring-integrated migrations)
- SpringDoc OpenAPI (Swagger UI)
- Spring Cloud AWS (S3 integration)
- AWS SDK for Java v2
- Python Lambda services and workers using Boto3, Pydantic, Paramiko, Psycopg, and Cryptography

## Data, Storage, and Persistence

- PostgreSQL (Amazon RDS in cloud; Postgres 16 in local Docker)
- H2 (test runtime for Spring services)
- Amazon DynamoDB
- Amazon S3
- Flyway migration pipelines for relational schemas

## Messaging and Integration

- Amazon SQS
- Amazon SNS
- Amazon EventBridge
- Amazon API Gateway
- Amazon SES
- Amazon Cognito
- SFTP ingestion flow (EC2-hosted OpenSSH server + Paramiko client)

## Infrastructure and Cloud (AWS)

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

## DevOps, CI/CD, and Build Tooling

- GitHub Actions
- Gradle
- npm
- pip
- Docker and Docker Compose
- Make
- jq (deployment and output parsing scripts)

## Testing, Quality, and Security Tooling

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

## Observability and Operations

- Amazon CloudWatch (logs, metrics, alarms, dashboards)
- AWS CloudTrail
- AWS GuardDuty
- ECS Container Insights
- Infracost (cost estimation in CI when configured)

## Third-Party Tooling
- [Brainboard](https://www.brainboard.co/)
- [Infracost](https://www.infracost.io/docs/)
- [LocalStack](https://www.localstack.cloud/)
