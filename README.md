# CS301-ITSA-Scroogebank-CRM

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

> A microservices-based Scroogebank CRM system with polyglot backend (Java/Python), React frontend, and local Kubernetes deployment using kind.

**Tech Stack:** Java 21 · Python 3.8+ · React 19 · Spring Boot · FastAPI · PostgreSQL · Kubernetes · Docker · Helm

---

## 🚀 Quickstart (3 Commands)

### Prerequisites
- **Python 3.8+** ([installation guide](docs/prerequisites/PYTHON-REQUIREMENT.md))
- **Docker Desktop** (must be running)

### Get Started
```bash
# 1. Setup your development environment (installs tools, verifies dependencies)
python scripts/pipelines/setup_dev_env.py

# 2. Run all tests (backend + frontend)
python scripts/pipelines/test_all.py

# 3. Deploy to local Kubernetes cluster
python scripts/pipelines/deploy_k8s.py
```

✅ **Success?** Access the CRM UI at [http://localhost](http://localhost) and APIs at `/api/*` endpoints.

**New to the project?** Follow the complete [onboarding guide](docs/onboarding/new-dev-setup.md).

---

## 📦 What's In This Repository

This monorepo contains a complete microservices application with local Kubernetes deployment:

- **4 Backend Services** (Java Spring Boot + Python FastAPI)
  - `agent` - Agent management service
  - `client` - Client management service
  - `transaction` - Transaction management service
  - `log` - Audit logging service (Python)

- **1 Frontend Service** (React 19 + Vite + TypeScript)
  - `crm-ui` - Customer relationship management UI

- **Local Kubernetes Stack**
  - kind cluster with ingress-nginx
  - PostgreSQL database (Bitnami Helm chart)
  - Automated deployment with smoke tests

- **CI/CD Pipeline**
  - GitHub Actions workflows for testing and validation
  - Cross-platform Python pipelines
  - Comprehensive smoke tests (infrastructure + health probes)

---

## 🛠️ Key Workflows

### Development
- **Setup environment:** [New Developer Setup](docs/onboarding/new-dev-setup.md)
- **Run tests:** [Testing Guide](docs/testing/TESTING-GUIDE.md)
- **Local Kubernetes:** [Local K8s Development](docs/local-k8s-dev.md)
- **Contributing:** [Contributing Guide](CONTRIBUTING.md)

### Operations
- **CI/CD workflows:** [GitHub Actions Guide](docs/testing/ci-cd-workflows.md)
- **Smoke testing:** [Smoke Test Guide](docs/testing/smoke/README.md)
- **Troubleshooting:** [Troubleshooting Guide](docs/troubleshooting.md)
- **Configuration:** [Configuration Guide](docs/configuration.md)

### Architecture
- **System overview:** [Architecture](docs/architecture.md)
- **Tech stack:** [Tech Stack](docs/main-diagrams/tech-stack.md)
- **Coding standards:** [Coding Standards](docs/coding-standards/coding-standards.md)
- **API contracts:** [OpenAPI Specifications](docs/api-contracts/openapi)

---

### General Pipeline Debugging Strategy: 
1. Run Individual Pipeline Locally (Own Service / Whole-Backend / Whole-Frontend)
2. (For Infrastructure): Run build-and-test-all -> Run test-and-spinup-all
3. Push to Remote (GitHub, to trigger GitHub Actions CI/CD Pipeline)

Notes:
- When making any local script pipeline changes, remember to adjust for GitHub Actions CI/CD 
- When making any changes to GitHub Actions Workflow Files on /main branch, remember to propagate changes throughout all other branches (notably: /integration and /infrastructure branch)
- /main will run all smoke tests for k8s
- /xfactor-backend branch has no GitHub Actions CI/CD Setup yet.

### Average Script/Pipeline Timings
- Setup / Bootstrap Script: 502.6s
- Backend Pipeline: 141.6s
- Frontend Pipeline: 223.0s
- K8s Deployment + Smoke Tests Pipeline: 490.0s
- Refer to GitHub Actions for more accurate parallelized timings for CI//CD minutes.

---

## 📚 Documentation Hub

**All documentation:** [docs/README.md](docs/README.md)

<details>
<summary><strong>Quick Reference: Common Commands</strong></summary>

### Testing
```bash
# All tests (backend + frontend)
python scripts/pipelines/test_all.py

# Backend only
python scripts/pipelines/test_backend.py

# Frontend only
python scripts/pipelines/test_frontend.py

# Single service (from service directory)
./gradlew localTestPipeline  # Java services
python run-local-test-pipeline.py  # Python log service
```

### Kubernetes Deployment
```bash
# Validate manifests (fast, no cluster needed)
make k8s-validate

# Full deploy (creates cluster, deploys apps, runs smoke tests)
python scripts/pipelines/deploy_k8s.py

# Keep cluster for debugging
python scripts/pipelines/deploy_k8s.py --keep-cluster

# Manual deployment steps (advanced)
make kind-up          # Create cluster
make infra-up         # Deploy infrastructure (PostgreSQL, ingress, metrics)
make build-images     # Build Docker images
make kind-load        # Load images into kind
make deploy-dev       # Deploy applications
make smoke            # Run smoke tests
```

### Environment Check
```bash
# Check if all tools are installed
python scripts/pipelines/setup_dev_env.py --doctor
```

</details>

<details>
<summary><strong>Repository Structure</strong></summary>

```
.
├── services/
│   ├── backend/
│   │   ├── agent/         # Agent service (Java/Spring Boot)
│   │   ├── client/        # Client service (Java/Spring Boot)
│   │   ├── transaction/   # Transaction service (Java/Spring Boot)
│   │   └── log/           # Log service (Python/FastAPI)
│   └── frontend/
│       └── crm-ui/        # React 19 + Vite frontend
│
├── platform/k8s/
│   ├── infra/
│   │   ├── kind-config.yaml         # kind cluster configuration
│   │   └── helm-values/             # Helm chart values (PostgreSQL, ingress, metrics)
│   └── apps/
│       ├── base/                    # Base Kubernetes manifests
│       └── overlays/dev/            # Development overlay (active)
│
├── scripts/
│   ├── pipelines/                   # Cross-platform Python pipelines
│   │   ├── setup_dev_env.py         # Developer environment setup
│   │   ├── test_all.py              # Run all tests
│   │   ├── test_backend.py          # Backend tests only
│   │   ├── test_frontend.py         # Frontend tests only
│   │   └── deploy_k8s.py            # Kubernetes deployment
│   ├── platform/                    # kind & infrastructure setup
│   ├── validate-k8s/                # Manifest validation
│   └── smoke-k8s-infra/             # Smoke tests
│
├── docs/                            # Documentation hub
│   ├── README.md                    # Documentation index
│   ├── architecture.md              # System architecture overview
│   ├── configuration.md             # Configuration guide
│   ├── troubleshooting.md           # Common issues and solutions
│   ├── local-k8s-dev.md            # Local Kubernetes guide
│   ├── onboarding/                  # Onboarding guides
│   ├── testing/                     # Testing documentation
│   ├── api-contracts/openapi/       # OpenAPI specifications
│   └── architectural-decisions-record/  # ADRs
│
├── .github/workflows/               # GitHub Actions CI/CD
│   ├── ci-main.yml                  # Main branch pipeline
│   ├── ci-integration.yml           # Integration pipeline
│   └── reusable-*.yml               # Reusable workflow components
│
├── CONTRIBUTING.md                  # Contributor guide
└── README.md                        # This file
```

</details>

---

## 🧪 Testing & Quality

All services include comprehensive testing:

- **Backend (Java):** JUnit 5, Mockito, Checkstyle, JaCoCo coverage
- **Backend (Python):** pytest, pytest-cov, black, flake8
- **Frontend:** Vitest, Playwright E2E, ESLint, Prettier, TypeScript strict mode

**Coverage Reports:** Generated automatically in `build-logs/` and `services/*/coverage/`

**CI/CD:** All tests run automatically on GitHub Actions for PRs and pushes to main. See [CI/CD Workflows](docs/testing/ci-cd-workflows.md).

---

## 🤝 Contributing

We welcome contributions! Please read the [Contributing Guide](CONTRIBUTING.md) for:

- Development workflow and branch strategy
- Coding standards and style guides
- Testing requirements and coverage expectations
- Pull request process and review checklist
- Git hooks setup

**Before submitting a PR:**
1. Run tests locally: `python scripts/pipelines/test_all.py`
2. Validate K8s manifests: `make k8s-validate`
3. Follow the [PR template](.github/pull_request_template.md)

---

## 📖 Additional Resources

- **[Full Documentation Index](docs/README.md)** - Complete guide to all documentation
- **[Architectural Decisions](docs/architectural-decisions-record/README.md)** - Key design decisions and rationale
- **[Tech Stack Details](docs/main-diagrams/tech-stack.md)** - Comprehensive technology overview
- **[Feature Specifications](docs/features/features.md)** - Business requirements and features

---

## 📜 License & Usage

This is an academic project developed for CS301 (Software Engineering Project) at Singapore Management University.

**For Team Members:** See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## ⚡ Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| **Docker daemon not running** | Start Docker Desktop and verify: `docker info` |
| **Python not found** | Install Python 3.8+: [Installation Guide](docs/prerequisites/PYTHON-REQUIREMENT.md) |
| **Tests failing** | Check [Testing Guide](docs/testing/TESTING-GUIDE.md) troubleshooting section |
| **K8s deployment issues** | See [Local K8s Troubleshooting](docs/local-k8s-dev.md#common-failure-modes-and-debug-commands) |
| **Environment setup issues** | Run: `python scripts/pipelines/setup_dev_env.py --doctor` |

**Need more help?** See the [complete troubleshooting guide](docs/troubleshooting.md).
