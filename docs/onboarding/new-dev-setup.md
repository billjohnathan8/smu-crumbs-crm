# New Developer Setup Guide

**Welcome to the CS301-ITSA-Scroogebank-CRM project!** This guide will get you from a fresh developer machine to running the full local development stack in minutes.

---

## Quick Start (TL;DR)

### Option 1: First-Time Setup (Recommended for New Machines)

#### Windows (PowerShell)
```powershell
# Clone the repo
git clone <repository-url>
cd project-2025-26-t2-project-2025-26t2-g2-t3

# Run first-time setup with comprehensive tracing
.\scripts\first-time-setup.ps1
```

#### macOS / Linux (Bash)
```bash
# Clone the repo
git clone <repository-url>
cd project-2025-26-t2-project-2025-26t2-g2-t3

# Run first-time setup with comprehensive tracing
chmod +x scripts/first-time-setup.sh
./scripts/first-time-setup.sh
```

**What it does:**
1. ✅ Checks all system dependencies (Docker, Git, Java, Node.js, etc.)
2. ✅ Enables verbose tracing for troubleshooting
3. ✅ Pre-pulls infrastructure images (~1-2GB) to prevent timeouts
4. ✅ Deploys to Kubernetes with detailed logs and progress
5. ✅ Generates comprehensive HTML report
6. ✅ Saves timestamped logs to `build-logs/first-time-setup/`

**Time:** 10-15 minutes on fresh machines with fast network

### Option 2: Manual Setup (Advanced)

#### Windows (PowerShell)
```powershell
# Clone the repo
git clone <repository-url>
cd project-2025-26-t2-project-2025-26t2-g2-t3

# Run environment setup only
python scripts/pipelines/setup_dev_env.py
```

#### macOS / Linux (Bash)
```bash
# Clone the repo
git clone <repository-url>
cd project-2025-26-t2-project-2025-26t2-g2-t3

# Run environment setup only
python3 scripts/pipelines/setup_dev_env.py
```

**What it does:**
1. ✅ Check your environment and detect what's installed
2. ✅ Install missing tools (portable by default, minimal global installs)
3. ✅ Configure dependencies (npm, Gradle, Python venv)
4. ✅ Provide clear next steps

**Then deploy manually:**
```bash
python scripts/pipelines/deploy_k8s.py --verbose  # With tracing (recommended)
# OR
python scripts/pipelines/deploy_k8s.py  # Standard mode
```

---

## What Gets Installed?

The setup script follows a **"portable by default"** philosophy to minimize system pollution:

### Global (System) Dependencies
These **must** be installed globally (no way around it):
- **Docker Desktop** (or Docker Engine) — Required for `kind` (Kubernetes in Docker)
- **Git** — Version control
  - **Windows**: [Git for Windows](https://git-scm.com/download/win) is **strongly recommended** (includes Git Bash + Make)
  - WSL bash is supported as fallback, but Git Bash provides better integration
- **Java 21** (Temurin/OpenJDK) — Backend services use Spring Boot + Java 21
- **Node.js ≥ 18** — Frontend uses React 19 + Vite
- **Make** (GNU Make) — Build automation
  - **Windows**: Included with Git for Windows, or install via scoop (`scoop install make`)
- **Python 3.8+** — Cross-platform build scripts and log service backend (optional)

### Portable CLI Tools (Downloaded to `.devtools/bin`)
By default, these are **NOT** installed globally:
- `kubectl` — Kubernetes CLI
- `helm` — Kubernetes package manager
- `kind` — Kubernetes in Docker (local cluster)
- `kubeconform` — K8s manifest validation

The script downloads pinned versions to `.devtools/bin` and updates your `PATH` for the current session.

**Want global installs instead?** Use `-System` flag (see [Advanced Usage](#advanced-usage)).

### Already in the Repo (No Install Needed)
These are checked into the repository:
- **Gradle Wrapper** (`./gradlew`, `./gradlew.bat`) — Java build tool wrapper
- **npm scripts** — Frontend build/test scripts in `package.json`

---

## Windows Path Compatibility

The project **fully supports paths with spaces** (like `C:\Program Files\Git`), which is critical for Windows users with standard tool installations.

### Bash Environment Options

On Windows, you have **two** options for running the deployment scripts:

#### Option 1: Git Bash (Recommended)
- **What**: Bash shell included with [Git for Windows](https://git-scm.com/download/win)
- **Installation**: `winget install Git.Git` or download installer
- **Location**: `C:\Program Files\Git\bin\bash.exe`
- **Why Recommended**: Better Windows path integration, includes Make utility
- **Usage**: Scripts automatically detect and use Git Bash

#### Option 2: WSL Bash (Supported)
- **What**: Windows Subsystem for Linux bash
- **Installation**: Already installed if you have WSL enabled
- **Location**: `C:\Windows\System32\bash.exe`
- **Usage**: Scripts automatically detect and fall back to WSL bash if Git Bash not found
- **Note**: Uses `/mnt/c/` paths instead of `/c/` paths

### Path Detection Priority

The deployment scripts automatically detect your bash environment in this order:
1. **Git Bash** (preferred) - `C:\Program Files\Git\bin\bash.exe`
2. **WSL Bash** (fallback) - `C:\Windows\System32\bash.exe`
3. **System PATH** - Any bash found on your PATH

**No configuration needed** - the scripts handle path spaces and environment detection automatically!

---

## Detected Requirements

The setup script automatically inventories the repository and reports what it finds:

### Backend Services
| Service       | Language | Build Tool       | Location                   |
|---------------|----------|------------------|----------------------------|
| Agent         | Java 21  | Gradle Wrapper   | `services/backend/agent`   |
| Client        | Java 21  | Gradle Wrapper   | `services/backend/client`  |
| Transaction   | Java 21  | Gradle Wrapper   | `services/backend/transaction` |
| Log (audit)   | Python   | requirements.txt | `services/backend/log`     |

### Frontend
| Service | Tech Stack             | Location                   |
|---------|------------------------|----------------------------|
| CRM UI  | React 19 + TypeScript + Vite | `services/frontend/crm-ui` |

### Local Kubernetes Setup
- **Cluster**: `kind` (Kubernetes in Docker)
- **Cluster name**: `cs301-crm`
- **Namespace**: `dev`
- **Ingress**: `ingress-nginx`
- **Database**: PostgreSQL (Bitnami Helm chart)
- **Metrics**: Metrics Server (Bitnami Helm chart)

### Pipeline Scripts (Already Present)
The setup script **calls** these existing scripts (doesn't reimplement them):
- `scripts/build-and-test-all/` — Test all services
- `scripts/build-and-test-backend/` — Test backend only
- `scripts/build-and-test-frontend/` — Test frontend only
- `scripts/test-and-spinup-all/` — Test + deploy to kind
- `scripts/build-and-deploy-k8s/` — Deploy only to kind
- `scripts/validate-k8s/` — Validate K8s manifests offline
- `Makefile` — Make targets for k8s operations

---

## Setup Modes

### 1. **Default Mode** (Portable + Verify)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1

# macOS/Linux
bash scripts/dev-setup/setup.sh
```
- Downloads CLI tools to `.devtools/bin`
- Updates `PATH` for current session only
- Initializes dependencies (npm ci, Python venv)
- Runs verification sequence (k8s-validate, backend tests, frontend tests)

### 2. **Doctor Mode** (Check Without Changes)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -Doctor

# macOS/Linux
bash scripts/dev-setup/setup.sh --doctor
```
- **Read-only diagnostics**: shows what's missing
- Provides actionable fixes for each issue
- Safe to run anytime
- Exit code: `0` if ready, `1` if issues found

### 3. **Verify Only** (Skip Setup)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -VerifyOnly

# macOS/Linux
bash scripts/dev-setup/setup.sh --verify-only
```
- Assumes environment is already configured
- Only runs verification pipelines
- Useful for CI or after manual setup changes

### 4. **Deploy Mode** (Setup + Verify + Deploy)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -Deploy

# macOS/Linux
bash scripts/dev-setup/setup.sh --deploy
```
- Runs full setup
- Runs verification
- **Deploys to local kind cluster** via `test-and-spinup-all`
- Takes ~10-15 minutes total

### 5. **Deploy-Only Mode** (Setup + k8s Deploy, No Tests)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -DeployOnly

# macOS/Linux
bash scripts/dev-setup/setup.sh --deploy-only
```
- Runs full setup (tools + dependencies)
- **Skips backend/frontend tests**
- Deploys directly to local kind cluster via `build-and-deploy-k8s-local`
- Useful for iterating on k8s deployment issues when tests already pass
- Takes ~5-8 minutes total
- Logs go to `build-logs/build-and-deploy-k8s/`

### 6. **First-Time Setup with Tracing** (Recommended for New Machines)
```powershell
# Windows
.\scripts\first-time-setup.ps1

# macOS/Linux
chmod +x scripts/first-time-setup.sh
./scripts/first-time-setup.sh
```
- **Optimized for fresh machines and troubleshooting**
- Automatically enables verbose tracing mode
- Shows real-time Docker image pull progress
- Displays detailed Helm deployment output
- Pre-pulls infrastructure images (~1-2GB) to prevent timeouts
- Generates timestamped logs in `build-logs/first-time-setup/`
- Creates comprehensive HTML report
- Takes ~10-15 minutes on first run (3-5 minutes on subsequent runs)

**What you see:**
```
========================================
FIRST-TIME SETUP WITH TRACING ENABLED
========================================
Log file: build-logs/first-time-setup/setup-20260209-143022.log

Step 1/4: Checking system dependencies...
[OK] Docker Desktop is running
[OK] Git version 2.43.0
[OK] Java 21.0.1
[OK] Node.js v20.11.0

Step 2/4: Deploying to Kubernetes (VERBOSE mode)...
Pre-pulling infrastructure images...
[1/4] registry.k8s.io/ingress-nginx/controller:v1.14.3
... [real-time Docker progress bars] ...
[SUCCESS] All 4 images loaded successfully!

[INFO] Running Helm with --debug: helm upgrade --install...
... [detailed Helm output] ...
[SUCCESS] Deployment successful!

========================================
FIRST-TIME SETUP COMPLETE!
========================================
```

**Options:**
```bash
# Skip deployment, setup only
.\scripts\first-time-setup.ps1 -SkipDeploy
./scripts/first-time-setup.sh --skip-deploy
```

---

## 🆕 Infrastructure Image Pre-Pull (Feb 2026 Update)

As of February 2026, **infrastructure image pre-pull is enabled by default** in all deployment workflows to prevent timeout failures on fresh machines.

**What changed:**
- ✅ Pre-pull now runs automatically (no `--prepull` flag needed)
- ✅ Fail-fast by default (clear errors instead of silent failures)
- ✅ Real-time progress output (see docker pull happening)
- ✅ Image verification after pulling
- ✅ Increased Helm timeouts (15m for ingress-nginx, up from 10m)

**Images pre-pulled (~1-2GB total):**
- `ingress-nginx/controller:v1.14.3` (~800MB-1GB)
- `ingress-nginx/kube-webhook-certgen:v1.6.7`
- `metrics-server/metrics-server:v0.8.0`
- `bitnami/postgresql:17.2.0-debian-12-r10`

**Time impact:**
- **Fresh machine**: Adds 3-5 minutes (prevents 10+ minute timeouts)
- **Cached images**: Completes in <1 minute

**Verbose tracing:**
```bash
# Enable detailed output for troubleshooting
python scripts/pipelines/deploy_k8s.py --verbose
make build-and-deploy-local-verbose
python scripts/platform/prepull-infra-images.py --verbose
python scripts/platform/infra-up.py --verbose
```

**Opt-out (not recommended for fresh machines):**
```bash
# Skip pre-pull (may cause timeouts on first deployment)
python scripts/pipelines/deploy_k8s.py --no-prepull
make build-and-deploy-local-no-prepull
```

See [Image Pre-Pull Guide](../deployment/image-prepull.md) for complete documentation.

---

## Advanced Usage

### Global (System) Install Mode
Install tools globally via package manager instead of `.devtools/bin`:

```powershell
# Windows (uses winget or scoop)
.\scripts\dev-setup\setup.ps1 -System

# macOS (uses Homebrew)
bash scripts/dev-setup/setup.sh --system

# Linux (uses apt-get)
bash scripts/dev-setup/setup.sh --system
```

### Persist PATH Changes
By default, `.devtools/bin` is only added to the current session's `PATH`. To persist it:

```powershell
# Windows (adds to User environment variable)
.\scripts\dev-setup\setup.ps1 -PersistPath

# macOS/Linux (adds to ~/.bashrc or ~/.zshrc)
bash scripts/dev-setup/setup.sh --persist-path
```

**Note**: On Windows, you'll need to restart your terminal after persisting PATH. On macOS/Linux, run `source ~/.bashrc` (or `~/.zshrc`).

### Skip Verification
If you only want to install tools without running tests:

```powershell
.\scripts\dev-setup\setup.ps1 -SkipVerify
```

### Combine Flags
```powershell
# System install + deploy + persist PATH
.\scripts\dev-setup\setup.ps1 -System -Deploy -PersistPath
```

---

## All Available Flags

| PowerShell Flag | Bash Flag | Description |
|-----------------|-----------|-------------|
| `-Doctor` | `--doctor` | Check environment without making changes (diagnostic mode) |
| `-SkipVerify` | `--skip-verify` | Skip verification sequence after setup |
| `-VerifyOnly` | `--verify-only` | Only run verification (skip setup) |
| `-Deploy` | `--deploy` | After verification, deploy to local kind cluster |
| `-DeployOnly` | `--deploy-only` | Deploy only (no backend/frontend tests) - fast k8s iteration |
| `-Portable` | `--portable` | Install tools to `.devtools/bin` (DEFAULT) |
| `-System` | `--system` | Install tools globally via package manager |
| `-PersistPath` | `--persist-path` | Persist `.devtools/bin` in PATH permanently |

**Note**: PowerShell uses single dash `-` (e.g., `-Deploy`), while Bash uses double dash `--` (e.g., `--deploy`).

---

## Verification Sequence

The setup script runs these checks in order:

### Step 1: K8s Manifest Validation
```bash
make k8s-validate
```
- Validates Helm charts (ingress-nginx, metrics-server, PostgreSQL)
- Validates Kustomize overlays (apps/overlays/dev)
- Uses `kubeconform` for schema validation
- **No cluster needed** (offline validation)

**Reference**: [docs/testing/k8s-validation.md](../testing/k8s-validation.md)

### Step 2: Backend Test Pipeline
Runs tests for all Java services (agent, client, transaction) and Python service (log):
- Unit tests
- Integration tests
- Code coverage reports
- Checkstyle validation

**Output**: `build-logs/build-and-test-backend/index.html`

**Reference**: [docs/testing/backend-local-pipeline.md](../testing/backend-local-pipeline.md)

### Step 3: Frontend Test Pipeline
Runs React tests for `crm-ui`:
- Unit tests (Vitest)
- Component tests (React Testing Library)
- Code coverage reports
- Linting (ESLint)
- Type checking (TypeScript)

**Output**: `services/frontend/crm-ui/coverage/index.html`

**Reference**: [docs/testing/frontend-local-pipeline.md](../testing/frontend-local-pipeline.md)

### Step 4: Deploy (Optional)

**`-Deploy` / `--deploy`** — Full test + deploy workflow:
- Re-runs backend + frontend tests
- Validates k8s manifests
- Creates kind cluster (`cs301-crm`)
- Installs infrastructure (ingress, PostgreSQL, metrics-server)
- Builds Docker images, loads into kind, deploys all services
- Runs smoke tests
- **Output**: `build-logs/test-and-spinup-all/`

**`-DeployOnly` / `--deploy-only`** — Deploy-only (no tests):
- Skips backend/frontend tests entirely
- Validates k8s manifests, builds images, deploys to kind, runs smoke tests
- Best for iterating on k8s issues when tests already pass
- **Output**: `build-logs/build-and-deploy-k8s/`

**Reference**: [docs/local-k8s-dev.md](../local-k8s-dev.md)

---

## Troubleshooting

### Docker Daemon Not Running
**Symptom**: Setup fails with "Docker daemon not running"

**Fix**:
1. Start Docker Desktop
2. Wait for Docker icon in system tray to show "Running"
3. Verify: `docker ps` should work without errors

### Java Version Too Old
**Symptom**: "Java 17 found, but Java 21 required"

**Fix (Windows)**:
```powershell
winget install EclipseAdoptium.Temurin.21.JDK
```

**Fix (macOS)**:
```bash
brew install openjdk@21
```

**Fix (Linux)**:
```bash
sudo apt-get install openjdk-21-jdk
```

### Node.js Version Too Old
**Symptom**: "Node.js 16.x found, but >=18 recommended"

**Fix (Windows)**:
```powershell
winget install OpenJS.NodeJS.LTS
```

**Fix (macOS)**:
```bash
brew install node@18
```

**Fix (Linux)**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Make Not Found (Windows)
**Symptom**: "'make' is not recognized"

**Fix (Option 1)**: Install via scoop
```powershell
scoop install make
```

**Fix (Option 2)**: Use Git for Windows (includes make in Git Bash)
```powershell
winget install Git.Git
# Then use: "C:\Program Files\Git\usr\bin\make.exe"
```

### kubeconform Not Found
**Symptom**: "kubeconform: command not found"

**Fix**: Re-run setup in portable mode (it will download kubeconform):
```powershell
.\scripts\dev-setup\setup.ps1
```

Or install manually:
- **Windows (scoop)**: `scoop install kubeconform`
- **macOS (brew)**: `brew install kubeconform`
- **Linux**: Download from [GitHub releases](https://github.com/yannh/kubeconform/releases)

### Verification Failed
**Symptom**: Backend or frontend tests fail during verification

**Fix**:
1. Check logs in `build-logs/` directory
2. For backend: `build-logs/build-and-test-backend/*.log`
3. For frontend: `services/frontend/crm-ui/coverage/`
4. Review error messages for missing dependencies
5. Re-run: `.\scripts\dev-setup\setup.ps1 --verify-only`

### Kind Cluster Already Exists
**Symptom**: "kind cluster cs301-crm already exists"

**Fix**: Delete existing cluster first
```bash
kind delete cluster --name cs301-crm
```

Then re-run setup with `-Deploy` (PowerShell) or `--deploy` (Bash).

---

## Directory Structure After Setup

```
project-2025-26-t2-project-2025-26t2-g2-t3/
├── .devtools/                    # Portable tools (if using -Portable / --portable)
│   └── bin/
│       ├── kubectl.exe
│       ├── helm.exe
│       ├── kind.exe
│       └── kubeconform.exe
├── build-logs/                   # All pipeline logs and reports
│   ├── dev-setup/                # Setup script logs
│   ├── build-and-test-backend/   # Backend coverage HTML
│   ├── build-and-test-frontend/  # Aggregated coverage index
│   └── test-and-spinup-all/      # Deploy logs + smoke tests
├── services/
│   ├── backend/
│   │   ├── agent/
│   │   │   ├── gradlew           # Gradle wrapper (✓ already present)
│   │   │   └── build/            # Compiled classes
│   │   ├── client/
│   │   ├── transaction/
│   │   └── log/
│   │       ├── venv/             # Python virtualenv (created by setup)
│   │       └── requirements.txt
│   └── frontend/
│       └── crm-ui/
│           ├── node_modules/     # npm dependencies (created by setup)
│           └── coverage/         # Test coverage HTML
└── scripts/dev-setup/
    ├── setup.ps1                 # Primary setup script (Windows)
    ├── setup.sh                  # Secondary setup script (Unix)
    └── setup.cmd                 # CMD wrapper
```

---

## Next Steps After Setup

### 1. Review Coding Standards
Read [docs/coding-standards/coding-standards.md](../coding-standards/coding-standards.md) before making changes:
- Git workflow (feature branches, conventional commits)
- Pull request requirements
- Code formatting (Checkstyle, ESLint, Prettier)
- Testing expectations

### 2. Understand the Tech Stack
Review [docs/main-diagrams/tech-stack.md](../main-diagrams/tech-stack.md):
- Architecture overview
- Technologies used (Spring Boot, React, K8s, Helm)
- AWS target state (for production)

### 3. Learn Local K8s Workflow
Read [docs/local-k8s-dev.md](../local-k8s-dev.md):
- Manual kind cluster setup
- Deploying services
- Troubleshooting deployments
- Smoke testing

### 4. Review API Contracts
Check [docs/api-contracts/openapi/](../api-contracts/openapi/):
- OpenAPI specs for each service
- Contract-first development approach

### 5. Run Your First Build
```powershell
# Test all services
.\scripts\build-and-test-all.cmd

# View coverage reports
# Open: build-logs/build-and-test-all/index.html in browser
```

### 6. Deploy to Local K8s
```powershell
# Full test + deploy workflow
.\scripts\test-and-spinup-all.cmd

# Access services
# Frontend: http://localhost
# Check with: kubectl get pods -n dev
```

### 7. Make Your First Contribution
1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes
3. Run tests: `.\scripts\build-and-test-all.cmd`
4. Commit: `git commit -m "feat: add my feature"`
5. Push: `git push origin feature/my-feature`
6. Create Pull Request

---

## Idempotency & Re-running Setup

The setup script is **safe to re-run**:
- Skips already-installed tools
- Won't overwrite existing `.env` files
- Won't reinstall `node_modules` if present
- Won't recreate Python venv if it exists

**When to re-run**:
- After pulling latest changes (new dependencies might be added)
- After switching branches (different requirements)
- If verification starts failing (re-initializes dependencies)
- If you suspect environment drift

```powershell
# Quick re-check
.\scripts\dev-setup\setup.ps1 -Doctor

# Full re-run (safe, idempotent)
.\scripts\dev-setup\setup.ps1
```

---

## FAQ

### Q: Do I need admin rights?
**A**: Only for installing system dependencies (Docker, Java, Node). The default `-Portable` mode does NOT require admin for CLI tools.

### Q: Can I use WSL (Windows Subsystem for Linux)?
**A**: Yes! You have two options:

**Option 1: Run PowerShell script with WSL bash** (Recommended for Windows)
```powershell
# The PowerShell setup script automatically detects and uses WSL bash
.\scripts\dev-setup\setup.ps1
```
The script will:
- Detect WSL bash at `C:\Windows\System32\bash.exe`
- Use `/mnt/c/` paths for Windows tools
- Find kubectl, helm, kind installed via Chocolatey or system PATH

**Option 2: Run Linux script inside WSL**
```bash
# Inside WSL terminal
bash scripts/dev-setup/setup.sh
```
This treats your environment as pure Linux and uses native Linux paths.

**Which should I use?**
- Use **Option 1** if you have Docker Desktop on Windows
- Use **Option 2** if you have Docker installed inside WSL itself

**Note**: Git Bash is still recommended for the best Windows experience, but WSL bash is fully supported!

### Q: What if I already have kubectl/helm/kind installed?
**A**: The script detects existing installations and skips them. It won't overwrite your system-installed tools.

### Q: How do I uninstall portable tools?
**A**: Delete the `.devtools/` directory:
```powershell
Remove-Item -Recurse -Force .devtools
```

### Q: How do I switch from portable to system install?
**A**: Run the setup script with `-System` flag. It will use your existing tools if found, or install them globally.

### Q: Can I run the setup offline?
**A**: Partially. If you already have all system dependencies (Docker, Git, Java, Node, Make) installed, you can skip the download phase. However, `npm ci` and tool downloads require internet.

### Q: Where are logs stored?
**A**: All logs go to `build-logs/dev-setup/setup_<timestamp>.log`. Each run creates a new timestamped log file.

---

## Getting Help

**Issues with setup**:
1. Run `-Doctor` mode to diagnose
2. Check logs in `build-logs/dev-setup/`
3. Review troubleshooting section above
4. Ask on team Telegram/Discord
5. Open a GitHub issue with logs attached

**Issues with pipelines**:
1. Check `build-logs/` for specific pipeline logs
2. Review pipeline-specific docs:
   - [backend-local-pipeline.md](../testing/backend-local-pipeline.md)
   - [frontend-local-pipeline.md](../testing/frontend-local-pipeline.md)
   - [local-k8s-dev.md](../local-k8s-dev.md)

**General questions**:
- Team Telegram/Discord
- Review [README.md](../../README.md)
- Check [coding-standards.md](../coding-standards/coding-standards.md)

---

## Related Documentation

- [README.md](../../README.md) — Project overview and quick commands
- [docs/local-k8s-dev.md](../local-k8s-dev.md) — Local K8s development runbook
- [docs/coding-standards/coding-standards.md](../coding-standards/coding-standards.md) — Contribution guidelines
- [docs/main-diagrams/tech-stack.md](../main-diagrams/tech-stack.md) — Tech stack overview
- [docs/testing/k8s-validation.md](../testing/k8s-validation.md) — K8s manifest validation
- [docs/testing/backend-local-pipeline.md](../testing/backend-local-pipeline.md) — Backend testing
- [docs/testing/frontend-local-pipeline.md](../testing/frontend-local-pipeline.md) — Frontend testing

---

**Last updated**: February 7, 2026  
**Maintained by**: CS301 ITSA Team

Welcome aboard! 🚀
