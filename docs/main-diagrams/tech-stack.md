# Tech Stack (Kubernetes-first, Cloud-Native (AWS))

This document defines the **end-to-end technology stack** for building the project **from the ground up**, with a strong emphasis on **Kubernetes**, **AWS**, **DevOps**, **OpenAPI-first** service design, and **Zero Trust (OAuth2)** security.

---

## 1) Architecture Summary

**Style:** Microservices + Kubernetes (EKS) + GitOps  
**Core idea:** All services run on Kubernetes. AWS provides managed infrastructure (EKS, RDS/Aurora, Cognito, ECR, networking).  
**Contract-first:** Every service exposes a versioned **OpenAPI** spec and implements to that contract.

---

## 2) Cloud & Infrastructure (AWS)

### 2.1 Core AWS Services
- **Amazon EKS** — Kubernetes cluster for production workloads
- **Amazon ECR** — container registry for all service images
- **Amazon VPC** — networking foundation (public/private subnets, routing)
- **IAM** — least-privilege permissions for cluster components + CI/CD
- **Route 53** (optional) — DNS for public endpoints
- **CloudWatch** (optional/minimum) — baseline logs/metrics if needed

### 2.2 Data Services
- **Amazon RDS / Aurora PostgreSQL** — primary transactional database (Multi-AZ recommended)
- **Amazon ElastiCache (Redis)** (optional) — caching layer for performance hotspots
- **Amazon DynamoDB** (optional) — high-volume logs/audit trails if needed

### 2.3 Security & Identity
- **AWS Cognito** — OAuth2 identity provider (MFA optional)
- **JWT access tokens** — used for Zero Trust: every request to every service is authenticated/authorized

---

## 3) Kubernetes Stack

### 3.1 Environments
- **Local Kubernetes:** `kind` or `k3d` (developer workstation)
- **Production Kubernetes:** AWS **EKS**

### 3.2 Core Kubernetes Concepts Used
- **Namespaces** (env separation, platform vs apps)
- **Deployments**, **Services**, **Ingress**
- **ConfigMaps**, **Secrets**
- **Readiness/Liveness probes**
- **HPA (Horizontal Pod Autoscaler)** for scaling
- **Resource requests/limits** for predictable scheduling

### 3.3 Ingress / Traffic
- **Local:** `ingress-nginx`
- **EKS:** **AWS Load Balancer Controller** (ALB/NLB-backed ingress)

---

## 4) Infrastructure as Code (IaC)

### 4.1 Provisioning AWS
- **Terraform** — VPC, EKS, node groups, ECR, RDS/Aurora, Cognito, etc.
- **Remote State** (recommended for teams)
  - **S3** for Terraform state
  - **DynamoDB** for state locking

### 4.2 Kubernetes Manifests
- **Kustomize** — environment overlays (`dev`, `staging`, `prod`)
- **Helm** — installing platform add-ons (ingress, monitoring, cert-manager, etc.)

---

## 5) GitOps & Delivery

### 5.1 GitOps Controller
- **Argo CD** — reconciles desired Kubernetes state from Git

### 5.2 CI/CD (Build → Test → Release → Deploy)
- **GitHub Actions** (or GitLab CI) pipeline stages:
  - Lint + unit tests
  - Validate OpenAPI specs
  - Build Docker images
  - Push images to ECR
  - Update GitOps manifests (or use image automation)
  - Deploy to environment (via Argo CD sync)
  - Run E2E tests (Playwright)

---

## 6) Application Stack

### 6.1 Frontend
- **React**
- **TypeScript**
- **Vite**
- UI option: **Material UI** (recommended for speed) or **Tailwind CSS**

### 6.2 Backend Microservices (recommended baseline)
- **Java 21**
- **Spring Boot**
  - Spring Web (REST APIs)
  - Spring Validation
  - Spring Security (OAuth2 resource server / JWT validation)
  - Spring Data JPA (if using PostgreSQL relational model)

### 6.3 Database & Migrations
- **PostgreSQL**
- **Flyway** (or Liquibase) — schema migrations, versioned DB changes

### 6.4 Service Contracts
- **OpenAPI 3.x** per service
- Contract stored in `/docs/api-contracts/openapi/<service>.yaml`
- Used for:
  - API validation
  - Documentation
  - Stubs/mocks if needed
  - Regression safety

---

## 7) External Integration (Feature 4)

### Mock SFTP Dependency
- **SFTP mock server** (containerized)
  - Used to simulate a bank SFTP feed for transaction ingestion
- Optional libraries/tools depending on implementation language:
  - SFTP client library (Java-based)
  - Scheduled polling / job runner (K8s CronJob or internal scheduler)

---

## 8) Observability & Operations

### 8.1 Metrics + Dashboards
- **Prometheus**
- **Grafana**

### 8.2 Tracing
- **Jaeger** (recommended)

### 8.3 Optional Service Mesh (for deeper Kubernetes learning)
- **Istio** (traffic policies, mTLS, retries, circuit breaking)
- **Kiali** (service mesh visualization)

> Service mesh is optional—use it if you want advanced learning and a strong “enterprise architecture” narrative.

---

## 9) Security Stack

### 9.1 Identity and Access
- **OAuth2** authentication via **Cognito**
- **JWT** validation at every service boundary (Zero Trust)
- Role model:
  - **Admin**
  - **Agent**

### 9.2 Secrets Management
- **Kubernetes Secrets** (local/dev)
- **External Secrets Operator** (recommended in AWS) to sync secrets from a secret manager (implementation choice):
  - AWS Secrets Manager or SSM Parameter Store (recommended)

### 9.3 Transport Security
- TLS termination via:
  - **cert-manager** (TLS certificates)
  - Ingress Controller integration

---

## 10) Testing Stack

### 10.1 Backend Testing
- **JUnit**
- **Mockito**
- **Testcontainers** (optional but highly useful for integration tests with Postgres)

### 10.2 Frontend Testing
- **Vitest** or **Jest**

### 10.3 End-to-End Testing
- **Playwright** (runs against a deployed environment)

### 10.4 Contract Validation
- OpenAPI validation step in CI (must pass before merges)

---

## 11) Developer Tooling & Local Environment

### 11.1 Recommended Developer Host Setup (Windows)
- **Windows + WSL2 (Ubuntu)** (recommended)
- **VS Code**
  - Extensions: Remote - WSL, Docker, Kubernetes, YAML, Terraform

### 11.2 Core CLI Tools
- **Git**
- **Docker Desktop**
- **kubectl**
- **Helm**
- **Kustomize**
- **kind** or **k3d**
- **AWS CLI v2**
- **Terraform**
- **eksctl** (recommended for EKS workflows)
- Utilities:
  - `jq`, `yq`, `make` (or `just`)

### 11.3 Language Runtimes
- **Node.js (LTS)** (via `nvm`)
- **Java 21** (Temurin/OpenJDK)
- **Gradle Wrapper** (`./gradlew`) (do not rely on global Gradle installs)

### 11.4 Standardization Option (Highly Recommended)
- **VS Code Dev Containers**
  - Ensures every developer gets identical versions of:
    - kubectl, helm, kustomize, terraform, awscli, node, java

---

## 12) Repo Structure Expectations (Stack-Driven)

Recommended directories:
- `/services` — microservices + frontend source
- `/docs/api-contracts/openapi` — OpenAPI specs per service
- `/platform/terraform` — AWS infrastructure (IaC)
- `/platform/k8s/infra` — cluster add-ons (ingress, monitoring, cert-manager, etc.)
- `/platform/k8s/apps` — application manifests + Kustomize overlays
- `/tests/e2e` — Playwright E2E tests
- `/docs/adr` — architecture decision records

---

## 13) Optional Enhancements (Add When Stable)

- **Redis caching** for high-read endpoints
- **DynamoDB** for high-volume logging/audit
- **Service mesh** (Istio + Kiali) for advanced traffic/security controls
- **Load testing** (k6/Locust) to demonstrate scalability NFR compliance

---

## 14) Version Pinning (Suggested)
Pin versions in the repo to ensure repeatability:
- Java: **21**
- Node: **LTS**
- Terraform: pinned in `required_version`
- Kubernetes add-ons: pinned Helm chart versions
- OpenAPI: **3.x**

---

## 15) Technology List (One-Liner Summary)

**AWS:** EKS, ECR, VPC, IAM, RDS/Aurora PostgreSQL, Cognito, (optional Redis/ElastiCache, DynamoDB, Route 53)  
**K8s:** Deployments, Services, Ingress, HPA, Secrets/ConfigMaps, probes, namespaces  
**IaC/GitOps:** Terraform, Helm, Kustomize, Argo CD  
**Backend:** Java 21, Spring Boot, JPA, Flyway  
**Frontend:** React, TypeScript, Vite, (MUI or Tailwind)  
**Observability:** Prometheus, Grafana, Jaeger, (optional Istio + Kiali)  
**Testing:** JUnit, Mockito, (optional Testcontainers), Playwright, OpenAPI validation  
**Tooling:** Docker, kubectl, helm, terraform, awscli, kind/k3d, VS Code + WSL2

**Notes:**
AZ / Region: ap-southeast-1 (Singapore Region)
---
