# Developer Environment Setup Scripts

> **⚠️ DEPRECATED - Legacy Scripts**
>
> This directory contains legacy PowerShell/Bash scripts that have been superseded by
> unified cross-platform Python pipelines.
>
> **Use Instead:** `python scripts/pipelines/setup_dev_env.py`
>
> **Migration Guide:** [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)
>
> **Removal Date:** August 8, 2026
>
> ---
>
> **Historical Documentation Below** (for reference only)

This directory contains automated setup scripts for onboarding new developers to the CS301-ITSA-Scroogebank-CRM project.

## Quick Start

### Windows
```powershell
.\scripts\dev-setup\setup.ps1
```

### macOS / Linux
```bash
bash scripts/dev-setup/setup.sh
```

### Windows (CMD)
```cmd
.\scripts\dev-setup\setup.cmd
```

## What's Inside?

| File | Description |
|------|-------------|
| `setup.ps1` | Primary setup script for Windows (PowerShell 5.1+) |
| `setup.sh` | Secondary setup script for macOS and Linux (Bash) |
| `setup.cmd` | Thin CMD wrapper that launches `setup.ps1` |

## Principles

### 1. **Portable by Default**
- Downloads CLI tools (kubectl, helm, kind, kubeconform) to `.devtools/bin`
- Minimizes global installations
- Only modifies current session PATH unless `-PersistPath` is used

### 2. **Idempotent**
- Safe to re-run multiple times
- Skips already-installed tools
- Won't overwrite existing configurations

### 3. **Self-Diagnosing**
- `--doctor` mode shows what's missing without making changes
- Provides actionable fixes for each issue
- Clear error messages with troubleshooting hints

### 4. **Minimal Global Installs**
Only these must be installed globally (no workarounds):
- Docker Desktop/Docker Engine
- Git
- Java 21
- Node.js >= 18
- Make

Everything else can be portable (downloaded to `.devtools/bin`).

## Usage Examples

### Check Environment (No Changes)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -Doctor

# macOS/Linux
bash scripts/dev-setup/setup.sh --doctor
```

**Output**: Diagnostic report showing:
- ✅ What's installed and working
- ❌ What's missing or outdated
- 💡 How to fix each issue

**Exit code**: 0 if ready, 1 if issues found

### Default Setup (Portable + Verify)
```powershell
# Windows
.\scripts\dev-setup\setup.ps1

# macOS/Linux
bash scripts/dev-setup/setup.sh
```

**What it does**:
1. Checks Docker, Git, Java, Node, Make (system dependencies)
2. Downloads kubectl, helm, kind, kubeconform to `.devtools/bin`
3. Updates PATH for current session
4. Initializes frontend dependencies (`npm ci`)
5. Verifies backend Gradle wrappers
6. Creates Python venv for log service
7. Runs verification:
   - `make k8s-validate`
   - Backend test pipeline
   - Frontend test pipeline

### System Install (Global Tools)
```powershell
# Windows (uses winget or scoop)
.\scripts\dev-setup\setup.ps1 -System

# macOS (uses Homebrew)
bash scripts/dev-setup/setup.sh --system

# Linux (uses apt-get)
bash scripts/dev-setup/setup.sh --system
```

Installs tools globally via package manager instead of `.devtools/bin`.

### Setup + Deploy to Kubernetes
```powershell
# Windows
.\scripts\dev-setup\setup.ps1 -Deploy

# macOS/Linux
bash scripts/dev-setup/setup.sh --deploy
```

Runs setup then **full test and deployment pipeline** via `test-and-spinup-all`:
- Backend tests + Frontend tests
- K8s validation
- Deploys to local kind cluster

**Note**: Without `-Deploy`, only runs k8s validation and individual test pipelines (no deployment).

### Persist PATH Changes
```powershell
# Windows (adds to User environment variable)
.\scripts\dev-setup\setup.ps1 -PersistPath

# macOS/Linux (adds to ~/.bashrc or ~/.zshrc)
bash scripts/dev-setup/setup.sh --persist-path
```

Makes `.devtools/bin` permanent in PATH (requires restart/reload).

### Skip Verification
```powershell
.\scripts\dev-setup\setup.ps1 -SkipVerify
```

Only installs tools; skips test pipelines.

### Verify Only
```powershell
.\scripts\dev-setup\setup.ps1 -VerifyOnly
```

Assumes environment is configured; only runs verification pipelines.

## All Flags

| PowerShell Flag | Bash Flag | Description |
|-----------------|-----------|-------------|
| `-Doctor` | `--doctor` | Check environment without making changes (diagnostic mode) |
| `-SkipVerify` | `--skip-verify` | Skip verification sequence after setup |
| `-VerifyOnly` | `--verify-only` | Only run verification (skip setup) |
| `-Deploy` | `--deploy` | Run full test and deployment pipeline (test-and-spinup-all) |
| `-Portable` | `--portable` | Install tools to `.devtools/bin` (DEFAULT) |
| `-System` | `--system` | Install tools globally via package manager |
| `-PersistPath` | `--persist-path` | Persist `.devtools/bin` in PATH permanently |

**Note**: PowerShell uses single dash `-` (e.g., `-Deploy`), while Bash uses double dash `--` (e.g., `--deploy`).

Flags can be combined:
```powershell
.\scripts\dev-setup\setup.ps1 -System -Deploy -PersistPath
```

## Logs

Logs are written to:
```
build-logs/dev-setup/setup_<timestamp>.log
```

Each run creates a timestamped log file for debugging.

## What Gets Installed?

### System Dependencies (Global, Required)
- **Docker Desktop** — Kind runs Kubernetes in Docker
- **Git** — Version control
- **Java 21** (Temurin/OpenJDK) — Backend services (Spring Boot)
- **Node.js >= 18** — Frontend (React 19 + Vite)
- **Make** — Build automation
- **Python 3.8+** — Cross-platform build scripts and log service backend

### CLI Tools (Portable by Default)
- **kubectl** — Kubernetes CLI
- **helm** — Kubernetes package manager (v3)
- **kind** — Kubernetes in Docker (local cluster)
- **kubeconform** — K8s manifest schema validator

### Repository Dependencies (Auto-Initialized)
- **npm packages** — Frontend dependencies (`npm ci` in `services/frontend/crm-ui`)
- **Gradle wrapper** — Backend build tool (already in repo, verified)
- **Python venv** — Log service dependencies (created in `services/backend/log/venv`)

## Verification Sequence

The scripts run these checks in order:

### 1. K8s Manifest Validation
```bash
make k8s-validate
```
- Validates Helm charts (ingress-nginx, metrics-server, PostgreSQL)
- Validates Kustomize overlays (`platform/k8s/apps/overlays/dev`)
- Uses `kubeconform` for schema validation
- **No cluster needed** (offline validation)

### 2. Backend Test Pipeline
Calls `scripts/build-and-test-backend/build-and-test-backend.ps1` (or `.sh`):
- Unit tests for agent, client, transaction (Java)
- Unit tests for log service (Python)
- Code coverage reports
- Checkstyle validation

**Output**: `build-logs/build-and-test-backend/index.html`

### 3. Frontend Test Pipeline
Calls `scripts/build-and-test-frontend/build-and-test-frontend.ps1` (or `.sh`):
- Unit tests (Vitest)
- Component tests (React Testing Library)
- Code coverage
- ESLint + TypeScript checks

**Output**: `services/frontend/crm-ui/coverage/index.html`

**Note**: Steps 1-3 are skipped if `--deploy` flag is used (test-and-spinup-all runs them instead)

### 4. Deploy (Optional, `--deploy` only)
When `--deploy` is specified, skips steps 1-3 above and instead runs:

`scripts/test-and-spinup-all/test-and-spinup-all.ps1` (or `.sh`):
- Backend + frontend tests (via build-and-test-all)
- Validates k8s manifests
- Creates kind cluster
- Installs infrastructure (ingress, PostgreSQL, metrics)
- Builds and deploys all services
- Runs smoke tests

**Output**: `build-logs/test-and-spinup-all/`

## Implementation Details

### setup.ps1 (Windows)
- **Language**: PowerShell 5.1+ (compatible with Windows 10/11 default PS)
- **Tool detection**: Uses `Get-Command`, version parsing
- **Downloads**: `Invoke-WebRequest` with `curl` fallback
- **Package managers**: winget (primary), scoop (fallback)
- **PATH updates**: `$env:PATH` for session, `SetEnvironmentVariable` for persistence
- **Logging**: Full UTF-8 log file in `build-logs/dev-setup/`

### setup.sh (macOS/Linux)
- **Language**: Bash (POSIX-compatible)
- **Tool detection**: `command -v`, version regex parsing
- **Downloads**: `curl` with tar/unzip extraction
- **Package managers**: 
  - macOS: Homebrew
  - Linux: apt-get (Debian/Ubuntu)
- **PATH updates**: Session export, appends to `~/.bashrc` or `~/.zshrc` for persistence
- **Logging**: Full log file in `build-logs/dev-setup/`

### setup.cmd (Windows CMD wrapper)
- **Language**: Windows Batch
- **Purpose**: Thin launcher for `setup.ps1`
- **Forwards all arguments** to PowerShell script
- **Exit code**: Propagates `setup.ps1` exit code

## Tool Versions

Current pinned versions (as of Feb 2026):

| Tool | Version | Why Pinned? |
|------|---------|-------------|
| kubectl | 1.31.0 | Matches kind's Kubernetes version |
| helm | 3.17.0 | Latest stable v3 |
| kind | 0.26.0 | Latest stable |
| kubeconform | 0.6.7 | Latest stable |

**Java**: Requires 21 (detected from `build.gradle` files in backend services)  
**Node.js**: Requires >= 18 (React 19 + modern tooling)  
**Python**: Recommends >= 3.7 (optional, for report generation)

## Troubleshooting

### "Docker daemon not running"
**Fix**: Start Docker Desktop, wait for "Running" status in system tray.

### "Java 17 found, but Java 21 required"
**Fix (Windows)**: `winget install EclipseAdoptium.Temurin.21.JDK`  
**Fix (macOS)**: `brew install openjdk@21`  
**Fix (Linux)**: `sudo apt-get install openjdk-21-jdk`

### "Node.js 16 found, but >= 18 recommended"
**Fix (Windows)**: `winget install OpenJS.NodeJS.LTS`  
**Fix (macOS)**: `brew install node@18`  
**Fix (Linux)**: See [Node.js docs](https://nodejs.org/)

### "make: command not found" (Windows)
**Fix (Option 1)**: `scoop install make`  
**Fix (Option 2)**: Install Git for Windows (includes make in Git Bash)

### "kubeconform: command not found"
**Fix**: Re-run setup in portable mode (downloads kubeconform automatically)

### Verification fails
**Diagnosis**:
1. Check logs in `build-logs/` (specific pipeline subdirectory)
2. Re-run: `.\scripts\dev-setup\setup.ps1 -VerifyOnly`
3. Review error messages in log file

## Related Documentation

- **[docs/onboarding/new-dev-setup.md](../../docs/onboarding/new-dev-setup.md)** — Full onboarding guide for new developers
- **[docs/local-k8s-dev.md](../../docs/local-k8s-dev.md)** — Local Kubernetes development runbook
- **[docs/coding-standards/coding-standards.md](../../docs/coding-standards/coding-standards.md)** — Contribution guidelines
- **[README.md](../../README.md)** — Project overview

## Maintenance

### Updating Tool Versions
Edit the URLs/versions in the "CLI TOOLS INSTALLATION" section of:
- `setup.ps1` (lines ~450-550)
- `setup.sh` (lines ~300-400)

Test after updating:
```powershell
# Delete portable cache
Remove-Item -Recurse -Force .devtools

# Re-run setup
.\scripts\dev-setup\setup.ps1
```

### Adding New Dependencies
1. Add detection logic in "ENVIRONMENT CHECKS" section
2. Add installation logic in "CLI TOOLS INSTALLATION" or "ENVIRONMENT CONFIGURATION"
3. Update "DETECTED REQUIREMENTS" output
4. Update `docs/onboarding/new-dev-setup.md`
5. Test on clean environment

### Testing
**Recommended testing environments**:
- Fresh Windows 11 VM (winget available)
- Fresh macOS VM (Homebrew)
- Fresh Ubuntu 22.04 VM (apt-get)

**Test matrix**:
- `--doctor` (should show missing tools)
- Default run (should install + verify)
- `--system` (should use package manager)
- `--deploy` (should deploy to kind)
- Re-run (should be idempotent)

---

**Last updated**: February 7, 2026  
**Maintained by**: CS301 ITSA Team
