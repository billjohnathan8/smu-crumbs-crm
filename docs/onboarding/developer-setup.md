# Developer Environment Setup

This directory contains the unified developer environment setup pipeline.

## Quick Start

### Option 1: Check Environment Only
```bash
# Windows
scripts\wrappers\setup.cmd --doctor

# Unix (macOS/Linux)
scripts/wrappers/setup.sh --doctor
```

### Option 2: Full Setup
```bash
# Windows
scripts\wrappers\setup.cmd

# Unix (macOS/Linux)
scripts/wrappers/setup.sh
```

## What It Does

The setup pipeline performs the following steps:

1. **Environment Check**
   - Verifies global dependencies (Docker, Git, Java 21+, Node.js 18+, Make, Python 3.8+)
   - Checks portable tools (kubectl, helm, kind, kubeconform)
   - Reports missing or outdated tools

2. **Tool Installation** (if needed)
   - Downloads missing portable tools to `.devtools/bin`
   - Makes tools available in current session PATH
   - Optionally persists PATH with `--persist-path`

3. **Dependency Configuration**
   - Prefetches Gradle dependencies for backend services
   - Sets up Python virtual environment and installs requirements
   - Installs npm dependencies for frontend

4. **Verification** (optional)
   - Runs test pipelines to verify setup
   - Can deploy to local Kubernetes with `--deploy`

## Command-Line Options

| Option | Description |
|--------|-------------|
| `--doctor` | Check environment without making changes (non-destructive) |
| `--skip-verify` | Skip verification tests after setup |
| `--verify-only` | Only run verification (assume setup already done) |
| `--deploy` | Run full test + deployment pipeline after setup |
| `--deploy-only` | Run Kubernetes deployment only (no tests) |
| `--system` | Install tools globally instead of to `.devtools/bin` |
| `--persist-path` | Add `.devtools/bin` to PATH permanently |

## Examples

### Check what's installed
```bash
python scripts/pipelines/setup_dev_env.py --doctor
```

### First-time setup
```bash
python scripts/pipelines/setup_dev_env.py
```

### Setup and deploy to local Kubernetes
```bash
python scripts/pipelines/setup_dev_env.py --deploy
```

### Only run verification tests
```bash
python scripts/pipelines/setup_dev_env.py --verify-only
```

## Dependencies

### Required (must be installed manually)
- **Docker Desktop** (or Docker Engine) - for kind
- **Git** - version control
- **Java 21+** (Temurin/OpenJDK) - backend Spring Boot
- **Node.js ≥18** - frontend React
- **Make** (GNU Make) - build automation
- **Python 3.8+** - cross-platform build scripts and log service

### Portable (auto-installed to `.devtools/bin`)
- **kubectl** - Kubernetes CLI
- **helm** - Kubernetes package manager
- **kind** - Kubernetes in Docker
- **kubeconform** - K8s manifest validation

### Embedded (already in repo)
- Gradle wrapper (gradlew/gradlew.bat)
- npm scripts (package.json)

## Troubleshooting

### Missing required tools
If doctor mode reports missing required tools, install them:

**Windows:**
```powershell
winget install Docker.DockerDesktop
winget install Git.Git
winget install EclipseAdoptium.Temurin.21.JDK
winget install OpenJS.NodeJS.LTS
winget install GnuWin32.Make
```

**macOS:**
```bash
brew install --cask docker
brew install git
brew install openjdk@21
brew install node@18
brew install make
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install docker.io git openjdk-21-jdk nodejs npm make
```

### Docker daemon not running
Start Docker Desktop or run:
```bash
# Linux/macOS
sudo systemctl start docker

# Windows
# Start Docker Desktop application
```

### Permission errors on Unix
Make wrapper script executable:
```bash
chmod +x scripts/wrappers/setup.sh
```

## Architecture

The setup pipeline is built on the platform abstraction layer:

```python
from scripts.core.detect import get_platform, is_windows
from scripts.core.logging import create_logger
```

This ensures:
- Cross-platform compatibility
- Consistent logging and error reporting
- Proper encoding handling (UTF-8 on Windows)

## Files Created

- **`scripts/pipelines/setup_dev_env.py`** - Main orchestrator (~700 lines)
- **`scripts/wrappers/setup.cmd`** - Windows wrapper
- **`scripts/wrappers/setup.sh`** - Unix wrapper
- **`.devtools/bin/`** - Portable tools directory
- **`build-logs/dev-setup/`** - Setup logs and HTML reports

## Replaces

This consolidated pipeline replaces:
- `scripts/dev-setup/setup.ps1` (Windows, 1095+ lines)
- `scripts/dev-setup/setup.sh` (Unix, similar size)

## Next Steps

After successful setup, you can:

1. **Run backend tests**
   ```bash
   python scripts/pipelines/test_backend.py
   ```

2. **Run frontend tests**
   ```bash
   python scripts/pipelines/test_frontend.py
   ```

3. **Deploy to local Kubernetes**
   ```bash
   python scripts/pipelines/deploy_k8s.py
   ```

4. **Open in VS Code**
   - Install recommended extensions
   - Start developing!
