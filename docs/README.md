# Documentation Hub

Welcome to the CS301-ITSA-Scroogebank-CRM documentation. This page serves as the central navigation for all project documentation.

---

## 🚀 Getting Started

**Prerequisites:** Before starting, ensure you have installed:
- **Docker Desktop** (or Docker Engine)
- **Git**
- **Java 21** (Temurin/OpenJDK)
- **Node.js ≥ 18**
- **Make** (GNU Make)
- **Python 3.8+**

**See:** [Prerequisites Guide](prerequisites/other-requirements.md) for detailed installation instructions.

---

**New to the project?** Start here:

1. **[New Developer Setup](onboarding/new-dev-setup.md)** - One-command environment setup
2. **[Quickstart (Main README)](../README.md#-quickstart-3-commands)** - Get running in 3 commands
3. **[Testing Guide](testing/TESTING-GUIDE.md)** - How to run tests locally
4. **[Local Kubernetes Development](local-k8s-dev.md)** - Deploy and debug locally

---

## 📋 Documentation by Audience

### For New Developers
- [New Developer Setup](onboarding/new-dev-setup.md) - Complete onboarding guide
- [Prerequisites](prerequisites/PYTHON-REQUIREMENT.md) - Required tools and installation
- [Tech Stack Overview](main-diagrams/tech-stack.md) - Technologies used in the project
- [Coding Standards](coding-standards/coding-standards.md) - Code style and best practices

### For Contributors
- [Contributing Guide](../CONTRIBUTING.md) - Development workflow and PR process
- [Testing Guide](testing/TESTING-GUIDE.md) - Running and writing tests
- [Local K8s Development](local-k8s-dev.md) - Kubernetes deployment workflow
- [Troubleshooting](troubleshooting.md) - Common issues and solutions

### For DevOps / Platform Engineers
- [CI/CD Workflows](testing/ci-cd-workflows.md) - GitHub Actions pipelines
- [K8s Manifest Validation](testing/k8s-validation.md) - Offline manifest validation
- [Smoke Testing Guide](testing/smoke/README.md) - Infrastructure and probe tests
- [Configuration Guide](configuration.md) - Environment variables and config
- [Migration Guide](migration/pipeline-migration.md) - Legacy to Python pipeline migration

### For Architects / Tech Leads
- [System Architecture](architecture.md) - High-level system design
- [Architectural Decision Records](architectural-decisions-record/README.md) - Key design decisions
- [Feature Specifications](features/features.md) - Business requirements
- [API Contracts](api-contracts/openapi) - OpenAPI specifications

---

## 📚 Documentation Sections

### Core Guides

| Guide | Description |
|-------|-------------|
| [Architecture](architecture.md) | System architecture, service responsibilities, data flows |
| [Configuration](configuration.md) | Environment variables, config files, secrets management |
| [Cross-Platform Scripting](cross-platform-scripting.md) | Bash script PATH handling for Windows, macOS, Linux |
| [Troubleshooting](troubleshooting.md) | Common issues, diagnostics, solutions |
| [Local K8s Development](local-k8s-dev.md) | Comprehensive guide for local Kubernetes deployment |

### Onboarding

| Guide | Description |
|-------|-------------|
| [New Developer Setup](onboarding/new-dev-setup.md) | Step-by-step environment setup for new team members |
| [Developer Setup (Legacy)](onboarding/developer-setup.md) | Alternative setup documentation |

### Testing & Quality

| Guide | Description |
|-------|-------------|
| [Testing Guide](testing/TESTING-GUIDE.md) | Cross-platform Python pipeline testing (main guide) |
| [Quick Test Reference](testing/QUICK-TEST.md) | Fast reference for common test commands |
| [CI/CD Workflows](testing/ci-cd-workflows.md) | GitHub Actions pipeline documentation |
| [Smoke Testing](testing/smoke/README.md) | Infrastructure and probe-aware smoke tests |
| [K8s Validation](testing/k8s-validation.md) | Offline Kubernetes manifest validation |

### Testing - CI Subsection

| Guide | Description |
|-------|-------------|
| [CI Architecture](testing/ci/architecture.md) | CI/CD architecture and job DAG |
| [Branch Strategy](testing/ci/branch-strategy.md) | Branch policies and merge rules |
| [CI Debugging](testing/ci/debugging.md) | Debugging failed CI runs |

### Technical Specifications

| Document | Description |
|----------|-------------|
| [Tech Stack](main-diagrams/tech-stack.md) | Technologies, frameworks, and tools |
| [Coding Standards](coding-standards/coding-standards.md) | Code style, linting, and conventions |
| [API Contracts](api-contracts/openapi) | OpenAPI specs for all services |
| [Feature Specifications](features/features.md) | Business requirements and features |

### Frontend Documentation

| Guide | Description |
|-------|-------------|
| [Frontend Overview](frontend/README.md) | React app architecture and structure |
| [Component Hierarchy](frontend/component-hierarchy.md) | Component tree and relationships |
| [User Flows](frontend/user-flows.md) | User interaction flows and screens |

### Architectural Decision Records (ADRs)

| ADR | Title |
|-----|-------|
| [ADR Index](architectural-decisions-record/README.md) | List of all ADRs |
| [ADR-0001](architectural-decisions-record/adr-0001-adopt-kind-kustomize-local-k8s-topology.md) | Adopt kind + Kustomize for local K8s |
| [ADR-0002](architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md) | Standardize local K8s deploy workflow |
| [ADR-0003](architectural-decisions-record/adr-0003-route-audit-events-to-http-log-service.md) | Route audit events to HTTP log service |
| [ADR-0004](architectural-decisions-record/adr-0004-adopt-polyglot-backend-local-ci-discovery.md) | Adopt polyglot backend + local CI discovery |
| [ADR-0005](architectural-decisions-record/adr-0005-align-openapi-with-active-local-http-interfaces.md) | Align OpenAPI with active HTTP interfaces |

### Migration Documentation

| Guide | Description |
|-------|-------------|
| [Pipeline Migration](migration/pipeline-migration.md) | PowerShell/Bash → Python migration details |
| [Migration Complete](migration/MIGRATION-COMPLETE.md) | Migration completion summary and timeline |

### Prerequisites

| Guide | Description |
|-------|-------------|
| [Python Requirement](prerequisites/PYTHON-REQUIREMENT.md) | Python installation and setup guide |
| [Other Requirements](prerequisites/other-requirements.md) | Additional tool requirements |

---

## 🔧 Script Documentation

### Pipeline Scripts

| Script | Purpose |
|--------|---------|
| [setup_dev_env.py](../scripts/pipelines/setup_dev_env.py) | Developer environment setup and validation |
| [test_all.py](../scripts/pipelines/test_all.py) | Run all tests (backend + frontend) |
| [test_backend.py](../scripts/pipelines/test_backend.py) | Run backend tests only |
| [test_frontend.py](../scripts/pipelines/test_frontend.py) | Run frontend tests only |
| [deploy_k8s.py](../scripts/pipelines/deploy_k8s.py) | Deploy to local Kubernetes cluster |

**Documentation:**
- [Build and Deploy Scripts](../scripts/build-and-deploy-k8s/README.md)
- [Smoke Test Scripts](../scripts/smoke-k8s-infra/README.md)
- [Dev Setup Scripts](../scripts/dev-setup/README.md)
- [Core Platform Abstraction](../scripts/core/README.md)

---

## 📦 Service Documentation

### Backend Services

| Service | Language/Framework | Description |
|---------|-------------------|-------------|
| [Agent](../services/backend/agent/README.md) | Java/Spring Boot | Agent management service |
| [Client](../services/backend/client/README.md) | Java/Spring Boot | Client management service |
| [Transaction](../services/backend/transaction/README.md) | Java/Spring Boot | Transaction management service |
| [Log](../services/backend/log/README.md) | Python/FastAPI | Audit logging service |

### Frontend Service

| Service | Framework | Description |
|---------|----------|-------------|
| [CRM UI](../services/frontend/crm-ui/README.md) | React 19 + Vite | Customer relationship management UI |

---

## 🛠️ Platform Configuration

| Resource | Location |
|----------|----------|
| **kind cluster config** | [platform/k8s/infra/kind-config.yaml](../platform/k8s/infra/kind-config.yaml) |
| **Helm values** | [platform/k8s/infra/helm-values/](../platform/k8s/infra/helm-values/) |
| **Base K8s manifests** | [platform/k8s/apps/base/](../platform/k8s/apps/base/) |
| **Dev overlay** | [platform/k8s/apps/overlays/dev/](../platform/k8s/apps/overlays/dev/) |

**Documentation:** [Helm Values README](../platform/k8s/infra/helm-values/README.md)

---

## 🎯 Quick Links

### Most Common Tasks

- **Setup environment:** `python scripts/pipelines/setup_dev_env.py` ([docs](onboarding/new-dev-setup.md))
- **Run all tests:** `python scripts/pipelines/test_all.py` ([docs](testing/TESTING-GUIDE.md))
- **Deploy to K8s:** `python scripts/pipelines/deploy_k8s.py` ([docs](local-k8s-dev.md))
- **Validate manifests:** `make k8s-validate` ([docs](testing/k8s-validation.md))
- **Troubleshoot issues:** [Troubleshooting Guide](troubleshooting.md)

### External Resources

- **GitHub Repository:** [Main Repo](https://github.com/cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3)
- **Pull Request Template:** [.github/pull_request_template.md](../.github/pull_request_template.md)
- **GitHub Actions:** [.github/workflows/](../.github/workflows/)

---

## 📝 Contributing to Documentation

Found an issue with the docs? Want to improve them?

1. **For typos/quick fixes:** Submit a PR directly
2. **For major changes:** Open an issue first to discuss
3. **Follow markdown standards:** Use linters, check links, test rendering

**Markdown style guide:**
- Use relative links: `[text](path/to/file.md)`
- Use code fences with language: ` ```bash `
- Keep lines under 120 characters where possible
- Use tables for structured data
- Add anchors for long documents

---

## 🔍 Document Status

| Status | Meaning |
|--------|---------|
| ✅ **Current** | Up to date with latest codebase |
| 🔄 **In Progress** | Being updated |
| ⚠️ **Deprecated** | Outdated, scheduled for removal |

**Last major documentation update:** February 2026 (Python pipeline migration)

---

## ❓ Need Help?

1. **Check existing docs** - Use the search function or browse by audience above
2. **Run doctor mode** - `python scripts/pipelines/setup_dev_env.py --doctor`
3. **Check troubleshooting guide** - [troubleshooting.md](troubleshooting.md)
4. **Ask the team** - Open a GitHub issue or discussion

**Back to main:** [Main README](../README.md)
