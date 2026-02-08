# System Architecture

This document provides a high-level overview of the CS301-ITSA-Scroogebank-CRM system architecture, service responsibilities, data flows, and infrastructure components.

---

## 📋 Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Service Responsibilities](#service-responsibilities)
- [Data Flow](#data-flow)
- [Infrastructure Components](#infrastructure-components)
- [Technology Stack](#technology-stack)
- [Design Decisions](#design-decisions)

---

## 🎯 System Overview

**CS301-ITSA-Scroogebank-CRM** is a microservices-based Customer Relationship Management system for insurance agents. The system enables:

- **Agent Management** - CRUD operations for insurance agents
- **Client Management** - CRUD operations for clients
- **Transaction Management** - Policy transactions and history
- **Audit Logging** - Event tracking and compliance logging

**Architecture Style:** Microservices
**Deployment:** Kubernetes (local: kind, target: AWS EKS)
**Backend:** Polyglot (Java Spring Boot + Python FastAPI)
**Frontend:** React 19 SPA with Vite
**Database:** PostgreSQL (shared for local dev, isolated per service in production)

---

## 🏗️ Architecture Diagram

### System Context (C4 Level 1)

```
┌──────────────┐
│   End User   │
│ (Agent/Admin)│
└──────┬───────┘
       │ HTTPS
       ↓
┌─────────────────────────────────────────────────────────┐
│                    CRM System                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   React UI  │  │   Backend    │  │   PostgreSQL   │ │
│  │   (Vite)    │  │ Microservices│  │   Database     │ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                       │
│                                                                 │
│  ┌────────────────────┐          ┌──────────────────────────┐  │
│  │   ingress-nginx    │          │       Frontend           │  │
│  │   (LoadBalancer)   │───────→  │   React SPA (crm-ui)     │  │
│  └────────┬───────────┘          └──────────────────────────┘  │
│           │                                                     │
│           │  /api/agents         ┌──────────────────────────┐  │
│           ├─────────────────────→│   Agent Service          │  │
│           │                      │   (Java/Spring Boot)     │  │
│           │                      └───────────┬──────────────┘  │
│           │  /api/clients        ┌──────────┴──────────────┐  │
│           ├─────────────────────→│   Client Service        │  │
│           │                      │   (Java/Spring Boot)    │  │
│           │                      └───────────┬─────────────┘  │
│           │  /api/transactions   ┌──────────┴──────────────┐  │
│           ├─────────────────────→│   Transaction Service   │  │
│           │                      │   (Java/Spring Boot)    │  │
│           │                      └───────────┬─────────────┘  │
│           │  /api/logs           ┌──────────┴──────────────┐  │
│           └─────────────────────→│   Log Service           │  │
│                                  │   (Python/FastAPI)      │  │
│                                  └───────────┬─────────────┘  │
│                                              ↓                 │
│                          ┌────────────────────────────────┐   │
│                          │      PostgreSQL Database       │   │
│                          │  (Bitnami Helm Chart)          │   │
│                          └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram (C4 Level 3 - Agent Service Example)

```
┌──────────────────────────────────────────────────────┐
│              Agent Service (Spring Boot)             │
│                                                      │
│  ┌────────────────┐         ┌──────────────────┐   │
│  │   Controller   │────────→│     Service      │   │
│  │  (REST API)    │         │  (Business Logic)│   │
│  └────────────────┘         └─────────┬────────┘   │
│                                       │             │
│                             ┌─────────↓────────┐   │
│                             │   Repository     │   │
│                             │  (JPA/Hibernate) │   │
│                             └─────────┬────────┘   │
└───────────────────────────────────────┼────────────┘
                                        │ JDBC
                                        ↓
                            ┌──────────────────────┐
                            │    PostgreSQL DB     │
                            │   (agents schema)    │
                            └──────────────────────┘
```

---

## 🔧 Service Responsibilities

### Frontend: crm-ui

**Technology:** React 19 + Vite + TypeScript
**Port:** 3000 (dev), 80 (prod via ingress)
**Responsibilities:**
- Render customer relationship management UI
- Handle user authentication and session management
- Consume backend REST APIs
- Implement client-side routing
- Provide responsive user experience

**Key Features:**
- Agent management dashboard
- Client CRUD operations
- Transaction history view
- Audit log viewer

**API Dependencies:**
- Agent Service (`/api/agents`)
- Client Service (`/api/clients`)
- Transaction Service (`/api/transactions`)
- Log Service (`/api/logs`)

---

### Backend: Agent Service

**Technology:** Java 21 + Spring Boot 3
**Port:** 8080
**Database:** PostgreSQL (`agents` schema)

**Responsibilities:**
- Manage agent lifecycle (create, read, update, delete)
- Validate agent data
- Emit audit events to Log Service
- Provide health and readiness endpoints

**Key Endpoints:**
- `GET /api/agents` - List all agents
- `GET /api/agents/{id}` - Get agent by ID
- `POST /api/agents` - Create new agent
- `PUT /api/agents/{id}` - Update agent
- `DELETE /api/agents/{id}` - Delete agent
- `GET /health` - Health check

**Domain Model:**
- `Agent` - Agent entity (id, name, email, phone, status, created_at, updated_at)

**API Specification:** [agent.yaml](api-contracts/openapi/agent.yaml)

---

### Backend: Client Service

**Technology:** Java 21 + Spring Boot 3
**Port:** 8081
**Database:** PostgreSQL (`clients` schema)

**Responsibilities:**
- Manage client lifecycle (create, read, update, delete)
- Validate client data
- Associate clients with agents
- Emit audit events to Log Service
- Provide health and readiness endpoints

**Key Endpoints:**
- `GET /api/clients` - List all clients
- `GET /api/clients/{id}` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/{id}` - Update client
- `DELETE /api/clients/{id}` - Delete client
- `GET /health` - Health check

**Domain Model:**
- `Client` - Client entity (id, name, email, phone, agent_id, status, created_at, updated_at)

**API Specification:** [client.yaml](api-contracts/openapi/client.yaml)

---

### Backend: Transaction Service

**Technology:** Java 21 + Spring Boot 3
**Port:** 8082
**Database:** PostgreSQL (`transactions` schema)

**Responsibilities:**
- Manage policy transactions
- Record transaction history
- Validate transaction data
- Emit audit events to Log Service
- Provide health and readiness endpoints

**Key Endpoints:**
- `GET /api/transactions` - List all transactions
- `GET /api/transactions/{id}` - Get transaction by ID
- `POST /api/transactions` - Create new transaction
- `PUT /api/transactions/{id}` - Update transaction
- `DELETE /api/transactions/{id}` - Delete transaction
- `GET /health` - Health check

**Domain Model:**
- `Transaction` - Transaction entity (id, client_id, amount, type, status, created_at, updated_at)

**API Specification:** [transaction.yaml](api-contracts/openapi/transaction.yaml)

---

### Backend: Log Service

**Technology:** Python 3.11 + FastAPI
**Port:** 8083
**Database:** PostgreSQL (`logs` schema)

**Responsibilities:**
- Receive and store audit events from other services
- Provide audit log retrieval endpoints
- Timestamp and categorize events
- Provide health and readiness endpoints

**Key Endpoints:**
- `GET /api/logs` - List all logs (with filters)
- `GET /api/logs/{id}` - Get log entry by ID
- `POST /api/logs` - Create new log entry
- `GET /health` - Health check

**Domain Model:**
- `LogEntry` - Log entity (id, service, action, user, timestamp, details)

**API Specification:** [log.yaml](api-contracts/openapi/log.yaml)

**Why Python?**
- Demonstrate polyglot microservices architecture
- FastAPI provides high performance for simple CRUD operations
- Python is well-suited for log processing and data aggregation

---

## 🔄 Data Flow

### Client Creation Flow (Example)

```
User (Browser)
    │
    │ 1. POST /api/clients
    ↓
Frontend (React)
    │
    │ 2. HTTP POST with client data
    ↓
Ingress-NGINX
    │
    │ 3. Routes to client-service
    ↓
Client Service (Java)
    │
    ├→ 4a. Validate data
    │
    ├→ 4b. Save to PostgreSQL (clients schema)
    │
    └→ 4c. POST /api/logs (audit event)
          │
          ↓
       Log Service (Python)
          │
          └→ 5. Save audit event to PostgreSQL (logs schema)
```

### Authentication Flow (Future Enhancement)

Currently: No authentication (demo/local dev only)

**Planned:** OAuth 2.0 with JWT tokens
```
User → Frontend → Auth Service → Issue JWT → Frontend stores token
       Frontend includes JWT in Authorization header for all API calls
       Backend services validate JWT before processing requests
```

---

## 🏗️ Infrastructure Components

### Local Development (kind)

| Component | Technology | Purpose | Namespace |
|-----------|------------|---------|-----------|
| **Cluster** | kind v0.25.0 | Kubernetes in Docker | N/A |
| **Ingress Controller** | ingress-nginx (Helm) | HTTP routing and load balancing | `ingress-nginx` |
| **Metrics Server** | metrics-server (Helm) | Resource metrics collection | `kube-system` |
| **Database** | PostgreSQL 15 (Bitnami Helm) | Relational database | `dev` |
| **Applications** | Custom deployments | Microservices | `dev` |

### Production (Planned - AWS EKS)

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Cluster** | AWS EKS | Managed Kubernetes |
| **Ingress** | AWS ALB Ingress Controller | Application load balancing |
| **Database** | AWS RDS PostgreSQL | Managed relational database |
| **Secrets** | AWS Secrets Manager | Secrets management |
| **Monitoring** | Prometheus + Grafana | Metrics and dashboards |
| **Logging** | ELK Stack | Centralized logging |

---

## 💻 Technology Stack

### Backend

| Service | Language | Framework | ORM | Testing |
|---------|----------|-----------|-----|---------|
| **Agent** | Java 21 | Spring Boot 3 | JPA/Hibernate | JUnit 5 + Mockito |
| **Client** | Java 21 | Spring Boot 3 | JPA/Hibernate | JUnit 5 + Mockito |
| **Transaction** | Java 21 | Spring Boot 3 | JPA/Hibernate | JUnit 5 + Mockito |
| **Log** | Python 3.11 | FastAPI | SQLAlchemy | pytest |

**Build Tools:**
- Java: Gradle 8.x with Groovy DSL
- Python: pip + venv

**Code Quality:**
- Java: Checkstyle, PMD, SpotBugs, JaCoCo
- Python: black, flake8, pytest-cov

### Frontend

| Aspect | Technology |
|--------|------------|
| **Framework** | React 19 |
| **Build Tool** | Vite 6 |
| **Language** | TypeScript (strict mode) |
| **Styling** | CSS Modules + Tailwind CSS |
| **State Management** | React Context + useState |
| **HTTP Client** | Fetch API + React Query |
| **Testing** | Vitest + React Testing Library + Playwright |
| **Linting** | ESLint + Prettier |

### Infrastructure

| Aspect | Technology |
|--------|------------|
| **Kubernetes** | kind (local) / AWS EKS (prod) |
| **Container Runtime** | Docker |
| **Package Manager** | Helm v3 |
| **Manifest Management** | Kustomize |
| **Ingress** | ingress-nginx |
| **Database** | PostgreSQL 15 |
| **CI/CD** | GitHub Actions |

**Full stack details:** [Tech Stack](main-diagrams/tech-stack.md)

---

## 🧭 Design Decisions

### Why Microservices?

**Rationale:**
- Educational project demonstrating microservices architecture
- Allows independent scaling of services
- Technology diversity (Java + Python)
- Clear separation of concerns

**Trade-offs:**
- Increased complexity vs. monolith
- Network overhead for inter-service communication
- Eventual consistency challenges

**See:** [ADR-0004: Adopt Polyglot Backend](architectural-decisions-record/adr-0004-adopt-polyglot-backend-local-ci-discovery.md)

---

### Why kind for Local Development?

**Rationale:**
- Runs Kubernetes clusters in Docker containers (fast startup)
- Full Kubernetes API compatibility
- No cloud dependencies for local dev
- Easy cluster reset and reproduction

**Alternative considered:** minikube, k3d, Docker Desktop Kubernetes

**See:** [ADR-0001: Adopt kind + Kustomize](architectural-decisions-record/adr-0001-adopt-kind-kustomize-local-k8s-topology.md)

---

### Why Polyglot Backend (Java + Python)?

**Rationale:**
- Demonstrate language-agnostic microservices
- Python's simplicity for log service (primarily CRUD)
- Java's enterprise readiness for core business services
- Team skill diversity

**Trade-offs:**
- Multiple build systems (Gradle + pip)
- Multiple testing frameworks
- Increased tooling requirements

**See:** [ADR-0004: Adopt Polyglot Backend](architectural-decisions-record/adr-0004-adopt-polyglot-backend-local-ci-discovery.md)

---

### Why Shared PostgreSQL in Local Dev?

**Rationale:**
- Simplified local setup (one database instance)
- Reduced resource usage
- Faster cluster startup

**Production plan:** Isolated databases per service (AWS RDS instances)

**See:** [Local K8s Development](local-k8s-dev.md)

---

### Why HTTP for Audit Events (Not Message Queue)?

**Rationale:**
- Simplicity for local development
- No additional infrastructure (Kafka, RabbitMQ)
- Acceptable for demo/educational project
- HTTP provides immediate feedback

**Production consideration:** Switch to async messaging (SQS, Kafka) for reliability

**See:** [ADR-0003: Route Audit Events to HTTP Log Service](architectural-decisions-record/adr-0003-route-audit-events-to-http-log-service.md)

---

## 📚 Related Documentation

- **[Tech Stack Details](main-diagrams/tech-stack.md)** - Complete technology breakdown
- **[Architectural Decision Records](architectural-decisions-record/README.md)** - All ADRs
- **[API Contracts](api-contracts/openapi)** - OpenAPI specifications
- **[Feature Specifications](features/features.md)** - Business requirements
- **[Local K8s Development](local-k8s-dev.md)** - Deployment guide
- **[Configuration Guide](configuration.md)** - Environment variables and config

---

## 🔮 Future Enhancements

### Short-Term (Next Sprint)

- [ ] Implement OAuth 2.0 authentication
- [ ] Add pagination to list endpoints
- [ ] Implement filtering and sorting
- [ ] Add API rate limiting
- [ ] Implement service-to-service authentication

### Medium-Term

- [ ] Switch audit events to async messaging (SQS/Kafka)
- [ ] Implement CQRS for transaction service
- [ ] Add Redis caching layer
- [ ] Implement distributed tracing (Jaeger)
- [ ] Add API gateway (Kong/Ambassador)

### Long-Term (Production Readiness)

- [ ] Deploy to AWS EKS
- [ ] Implement auto-scaling (HPA + Cluster Autoscaler)
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Implement centralized logging (ELK)
- [ ] Add disaster recovery procedures
- [ ] Implement blue-green deployments
- [ ] Set up service mesh (Istio)

---

**Last Updated:** February 2026
**Maintained By:** Architecture Team

**Questions?** See [documentation hub](README.md) or open an issue.
