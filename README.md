# Scroogebank Enterprise CRM (CRUMBS)
[![AWS](https://custom-icon-badges.demolab.com/badge/AWS-%23FF9900.svg?logo=aws&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB)](#)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff)](#)
[![AWS Lambda](https://custom-icon-badges.demolab.com/badge/AWS%20Lambda-%23FF9900.svg?logo=aws-lambda&logoColor=white)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-009485.svg?logo=fastapi&logoColor=white)](#)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-6DB33F?logo=springboot&logoColor=fff)](#)
[![Git](https://img.shields.io/badge/Git-F05032?logo=git&logoColor=fff)](#)
[![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=fff)](#)
[![Nodemon](https://img.shields.io/badge/Nodemon-76D04B?logo=nodemon&logoColor=fff)](#)
[![GitHub](https://img.shields.io/badge/GitHub-%23121011.svg?logo=github&logoColor=white)](#)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=github-actions&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](#)
[![Terraform](https://img.shields.io/badge/Terraform-844FBA?logo=terraform&logoColor=fff)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](#)
[![Java](https://img.shields.io/badge/Java-ED8B00?logo=openjdk&logoColor=fff)](#)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=fff)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=fff)](#)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=fff)](#)
[![Gradle](https://img.shields.io/badge/Gradle-02303A?logo=gradle&logoColor=fff)](#)
[![LocalStack](https://img.shields.io/badge/LocalStack-000000?logo=localstack&logoColor=fff)](#)
[![Trivy](https://img.shields.io/badge/Trivy-1904DA?logo=trivy&logoColor=fff)](#)
[![Checkov](https://img.shields.io/badge/Checkov-111827?logo=shield&logoColor=fff)](#)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=fff)](#)
[![JUnit5](https://img.shields.io/badge/JUnit5-C21325?logo=junit5&logoColor=fff)](#)
[![Pytest](https://img.shields.io/badge/Pytest-fff?logo=pytest&logoColor=000)](#)
[![Playwright](https://custom-icon-badges.demolab.com/badge/Playwright-2EAD33?logo=playwright&logoColor=fff)](#)

A **cloud-native enterprise CRM platform** built for Scrooge Global Bank as the flagship project for **SMU CS301** (IT Solution Architecture) in collaboration with **UBS Singapore**.

![Dashboard](docs/screens/dashboard-pt1.png)



This system supports secure banking operations across user administration, client onboarding, account management, transaction workflows, auditability, and verification pipelines.

**Check out our project demo video below!**
[![Project Demo Video](https://img.youtube.com/vi/rY69Sh_sGok/0.jpg)](https://www.youtube.com/watch?v=rY69Sh_sGok)
*https://www.youtube.com/watch?v=rY69Sh_sGok*


## 🏆 Key Technical Achievements
- **Performance:** Load-tested at **100 concurrent users** with target gates of **P95 < 5s** and **<1% error rate**, plus **200-thread stress** scenarios.
- **Availability:** Built for failover with **RDS Multi-AZ**, **2 AZs**, **4 subnets**, and **2 NAT gateways** in production architecture.
- **Security & Operations:** Enforced enterprise controls with **Cognito auth + MFA modes** and **GuardDuty**.
- **Observability:** Production telemetry is codified in Terraform with **35 CloudWatch alarms**, centralized **CloudTrail** auditing, and **SNS-backed alert routing** for faster incident detection.
- **Scalability:** Delivered a production-size cloud platform with **337 Terraform-managed resources**, including **3 ECS services**, **6 Lambdas**, and **21 API routes**.
- **Meaningful DevOps at-scale:** End-to-end automation via **CI/CD Pipelines** on **GitHub Actions** and **IaC** with **Terraform**.
- **Engineering Rigour:** Implemented CI-equivalent, multi-layer quality gates (lint, unit, integration, E2E, performance) and integrated security across the quality gates, API contracts, and infrastructure checks.

# 🏗️ System Architecture

![Architecture Diagram](docs/main-diagrams/main-aws-architecture-diagram-light-mode.png)

## ⚙️ Core Capabilities

- **Authentication and Access Control:** local/hybrid/Cognito modes, role-based access (RBAC), root-admin protections.
- **User Management:** create/manage admin and agent users with policy-aligned controls.
- **Client Lifecycle:** onboarding, KYC verification, account operations, archival/reinstatement flows.
- **Transactions and Compliance:** transaction retrieval/import workflows, audit logging, and AML alert pipelines.
- **Cloud Operations:** Terraform-based provisioning, environment profiles, local AWS emulation, and deployment scripts.

## 📱 User Interface Preview
### Login
![Login](docs/screens/login.png)

### Dashboard & Administration
![Admin Dashboard](docs/screens/dashboard-pt1.png)
![Admin Dashboard Pt2](docs/screens/dashboard-pt2.png)

### User Management
![User Management](docs/screens/admin-mgmt.png)

### Client Lifecycle
![Clients](docs/screens/clients.png)
![Client Profile](docs/screens/client-1.png)
![Client Profile](docs/screens/client-2.png)
![Client Profile](docs/screens/client-3.png)

### Transactions & Monitoring
![Transactions](docs/screens/transactions.png)
![Logs](docs/screens/logs.png)

### Compliance & Alerts
![AML Alerts](docs/screens/aml.png)

# 🧭 Getting Started

## 🧩 1. Prerequisites

- Git
- Docker Desktop (or Docker Engine)
- Java 21
- Node.js 22+
- Python 3.12+

Optional for cloud deployment workflows:
- Terraform
- AWS CLI
- `jq`

## 🛠️ 2. Configure Local Environment

```bash
cp .env.example .env.local
```

Set required values in `.env.local`:
- `LOCAL_DB_PASSWORD`
- `JWT_HMAC_SECRET`
- `E2E_ADMIN_PASSWORD`
- `E2E_USER_PASSWORD`

## ▶️ 3. Bootstrap tools and start the local stack

```bash
python scripts/pipelines/setup_dev_env.py
bash scripts/dev/stack-up.sh
```

## ✅ 4. Verify the app is running

- App gateway: `http://127.0.0.1:18088`
- Health checks:
  - `http://127.0.0.1:18088/api/user/health`
  - `http://127.0.0.1:18088/api/clients/health`
  - `http://127.0.0.1:18088/api/transactions/health`

Default seeded users:
- `admin@crm.com`
- `agent1@crm.com`

## 🧪 5. Run the main local test pipeline

```bash
python scripts/pipelines/test_all.py
```

## 🛑 6. Stop local services

```bash
bash scripts/dev/stack-down.sh
```

# 📚 Core Documentation

## 📍 Start Here!

- [Documentation hub](docs/README.md)
- [Tech stack](docs/infrastructure/tech-stack.md)
- [Database and environment configuration](docs/database_configuration.md)
- [Testing guide](docs/testing/TESTING-GUIDE.md)

## 🖥️ Frontend Documentation

- [Frontend guide](docs/frontend/README.md)
- [Core user flows](docs/frontend/core-user-flows.md)
- [Component hierarchy](docs/frontend/component-hierarchy.md)
- [Frontend service README](services/frontend/crm-ui/README.md)

## ☁️ Infrastructure and Deployment

- [LocalStack setup](docs/infrastructure/localstack-setup.md)
- [Terraform infrastructure workflow](docs/infrastructure/terraform-infra-workflow.md)
- [Terraform remote state setup](docs/infrastructure/terraform-remote-state.md)
- [Cognito auth rollout and modes](docs/infrastructure/cognito-auth.md)
- [SFTP ingestion setup](docs/infrastructure/sftp-setup.md)
- [InfraMap and Terraform graph tooling](docs/infrastructure/inframap-setup.md)

## 📐 Architecture Decisions and Contracts

- [ADR index](docs/architectural-decisions-record/README.md)
- [CAP theorem tradeoff ADR](docs/architectural-decisions-record/adr-0008-cap-tradeoff-analysis.md)
- [Role and root-admin contract](docs/api-contracts/role-root-admin-contract.md)
- [SFTP transaction ingestion contract](docs/api-contracts/sftp-transaction-ingestion-contract.md)
- [Audit/AML consumer event contracts](docs/api-contracts/audit-aml-consumer-event-contracts.md)
- [OpenAPI contracts](docs/api-contracts/openapi)

## 📊 Evidence and Operational Artifacts

- [AWS infrastructure map](docs/artifacts/aws-infrastructure-map.md)
- [Terraform inventory reconciliation](docs/artifacts/terraform-inventory.md)
- [Infrastructure cost estimate](docs/artifacts/cost-estimate.md)
- [Latest local CI-equivalent run summary](build-logs/test-all/last-run-summary.md)
- [Integration test docs](tests/integration/README.md)
- [Performance test docs](tests/performance/README.md)

## 🧰 Engineering Standards

- [Coding standards](docs/coding-standards/coding-standards.md)
- [Contributing guide (artifact)](docs/artifacts/CONTRIBUTING.md)
- [Final submission guide](docs/final-submission/README.md)

# 🍪 Team CRUMBS
**SMU CS301 G2-T3 (AY25/26 T2):**
> we ate and left no crumbs
- [Bill Johnathan](https://github.com/billjohnathan8) (Mr. CI)
- [Bernardinus Matteo Woenardi](https://github.com/mattw23n) (Mr. CD)
- [Denise Lie](https://github.com/deniseLie)
- [Peh Siew Yu](https://github.com/siewyu)
- [Tania Lee Gunawan](https://github.com/tanialee21)
- [Toh De Xue](https://github.com/dexue67)
- [Verdio Wong](https://github.com/verdiowong)

---

This project was completed as part of CS301 IT Systems Architecture at Singapore Management University. It demonstrates enterprise architecture design, cloud engineering, and software delivery practices in one integrated system.
