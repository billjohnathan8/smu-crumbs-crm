
[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ojTTbieH)

# CS301 ITSA Scroogebank Enterprise CRM
![AWS](https://img.shields.io/badge/AWS-Cloud%20Native-orange)
![Microservices](https://img.shields.io/badge/Architecture-Microservices-yellow)
![K8s](https://img.shields.io/badge/K8s-Kubernetes-blue)
![React](https://img.shields.io/badge/Frontend-React-63e5ff)
![Java](https://img.shields.io/badge/Backend-Springboot-green)
![Python](https://img.shields.io/badge/Backend-FastAPI-006666)
![Terraform](https://img.shields.io/badge/IaC-Terraform-purple)
--- 
> A cloud-native, microservices-based, and enterprise Customer Relationship Management (CRM) system for Scrooge Global Bank - developed as the flagship project for CS301 IT Solution Architecture (ITSA).

# Tech Stack at a Glance:  
Java 21 · Python 3.8+ · React 19 · Spring Boot · FastAPI · PostgreSQL · Kubernetes · Docker · Helm · K8s

---

## 🚀 Quickstart (3 Commands)

### Prerequisites

Before running the setup, ensure you have these installed:

**Required System Dependencies:**
- **Docker Desktop** (or Docker Engine) - Kubernetes via kind ([Installation Guide](https://docs.docker.com/get-docker/))
- **Git** - Version control ([Download](https://git-scm.com/downloads))
  - **Windows users**: [Git for Windows](https://git-scm.com/download/win) strongly recommended (includes Git Bash + Make)
  - Paths with spaces (like `C:\Program Files\Git`) are fully supported ✅
  - WSL bash is also supported as fallback
  - All bash scripts use [common environment detection](scripts/common/setup-env.sh) for cross-platform compatibility
- **Java 21** (Temurin/OpenJDK) - Backend services ([Download](https://adoptium.net/))
- **Node.js ≥ 18** - Frontend build tooling ([Download](https://nodejs.org/))
- **Make** (GNU Make) - Build automation (included with Git for Windows on Windows)
- **Python 3.8+** - Build scripts and log service ([Installation Guide](docs/prerequisites/PYTHON-REQUIREMENT.md))

**Note:** The setup script will automatically install CLI tools (kubectl, helm, kind, kubeconform) to `.devtools/bin`. You do not need to install these manually. Deployment scripts automatically detect and configure PATH for Windows (Git Bash/WSL), macOS, and Linux.

**See:** [Complete Prerequisites Guide](docs/prerequisites/other-requirements.md) for detailed installation instructions.

### Get Started

#### Option 1: First-Time Setup (Recommended for New Machines)
```bash
# Automated setup with comprehensive tracing (Windows)
.\scripts\first-time-setup.ps1

# Or on Linux/macOS
chmod +x scripts/first-time-setup.sh
./scripts/first-time-setup.sh
```
This script automatically:
- ✅ Checks all dependencies
- ✅ Enables verbose tracing for troubleshooting
- ✅ Pre-pulls infrastructure images (prevents timeouts)
- ✅ Deploys to Kubernetes with detailed logs
- ✅ Generates comprehensive HTML report

Logs saved to: `build-logs/first-time-setup/setup-YYYYMMDD-HHMMSS.log`

#### Option 2: Manual Setup
```bash
# 1. Setup your development environment (installs tools, verifies dependencies)
python scripts/pipelines/setup_dev_env.py

# 2. Run all tests (backend + frontend)
python scripts/pipelines/test_all.py

# 3. Deploy to local Kubernetes cluster (with automatic image pre-pull)
python scripts/pipelines/deploy_k8s.py

# 3b. Deploy with verbose tracing (for troubleshooting or first-time setup)
python scripts/pipelines/deploy_k8s.py --verbose
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

**Fresh Machine (First Run):**
- First-time setup with tracing: ~10-15 minutes
- Pre-pull infrastructure images: 3-5 minutes (with fast network)
- K8s Deployment + Smoke Tests: 8-13 minutes total

**Cached Images (Subsequent Runs):**
- Setup / Bootstrap Script: 502.6s
- Backend Pipeline: 141.6s
- Frontend Pipeline: 223.0s
- K8s Deployment + Smoke Tests Pipeline: 3-5 minutes (images cached)

**Note:** As of Feb 2026, infrastructure images (~1-2GB) are pre-pulled by default before Helm deployment. This prevents timeout failures but adds 3-5 minutes on first run with fresh machines. Subsequent deployments are much faster (~3-5 minutes total) as images are cached.

Refer to GitHub Actions for more accurate parallelized timings for CI/CD minutes.

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

# Full deploy (creates cluster, pre-pulls images, deploys apps, runs smoke tests)
python scripts/pipelines/deploy_k8s.py

# Verbose deployment (shows detailed Helm output, Docker progress)
python scripts/pipelines/deploy_k8s.py --verbose
make build-and-deploy-local-verbose  # Or use Make target

# Skip pre-pull (not recommended for fresh machines)
python scripts/pipelines/deploy_k8s.py --no-prepull

# Keep cluster for debugging
python scripts/pipelines/deploy_k8s.py --keep

# Manual deployment steps (advanced)
make kind-up                 # Create cluster
make prepull-infra-images    # Pre-pull infrastructure images (now default)
make prepull-infra-images VERBOSE=1  # With detailed tracing
make infra-up                # Deploy infrastructure (PostgreSQL, ingress, metrics)
make infra-up VERBOSE=1      # With Helm debug output
make build-images            # Build Docker images
make kind-load               # Load images into kind
make deploy-dev              # Deploy applications
make smoke                   # Run smoke tests

# Deployment variants
make build-and-deploy-local           # Default (includes pre-pull)
make build-and-deploy-local-verbose   # With detailed tracing
make build-and-deploy-local-no-prepull  # Skip pre-pull (not recommended)
```

**Note:** As of Feb 2026, infrastructure image pre-pull is **enabled by default** to prevent timeout failures on fresh machines. The ~1-2GB of images are pulled and verified before Helm deployment starts.

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
| **Helm timeout on first deployment** | Use first-time setup script: `.\scripts\first-time-setup.ps1` (enables pre-pull) |
| **Image pull timeout** | Increase timeout: `python scripts/platform/prepull-infra-images.py --timeout 1800` |
| **Pre-pull fails** | Check Docker: `docker ps`, or use verbose mode: `--verbose` |
| **Python not found** | Install Python 3.8+: [Installation Guide](docs/prerequisites/PYTHON-REQUIREMENT.md) |
| **Tests failing** | Check [Testing Guide](docs/testing/TESTING-GUIDE.md) troubleshooting section |
| **K8s deployment issues** | Enable verbose: `make build-and-deploy-local-verbose` or see [Troubleshooting](docs/local-k8s-dev.md#common-failure-modes-and-debug-commands) |
| **Environment setup issues** | Run: `python scripts/pipelines/setup_dev_env.py --doctor` |
| **Need detailed logs** | Check: `build-logs/first-time-setup/` or `build-logs/build-and-deploy-k8s/deployment-report.html` |

**Need more help?** See the [complete troubleshooting guide](docs/troubleshooting.md) or [image pre-pull guide](docs/deployment/image-prepull.md).
