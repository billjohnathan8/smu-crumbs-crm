# System Prerequisites

This guide lists all required system dependencies that must be manually installed before running the developer setup scripts.

---

## Quick Checklist

Before running `python scripts/pipelines/setup_dev_env.py`, ensure you have:

- ✅ **Docker Desktop** (or Docker Engine)
- ✅ **Git**
- ✅ **Java 21** (Temurin/OpenJDK)
- ✅ **Node.js ≥ 18**
- ✅ **Make** (GNU Make)
- ✅ **Python 3.8+**

**Note:** CLI tools (kubectl, helm, kind, kubeconform) will be automatically installed to `.devtools/bin` by the setup script. You do not need to install these manually.

**Note to Windows Users:** Ensure your system is allowed to run scripts. If is it not enabled to run scripts, run this command in Powershell (as Administrator) for your entire machine (i.e., running powershell from windows icon bar): 
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## Required System Dependencies

### 1. Docker Desktop (or Docker Engine)

**What it is:** Container runtime and orchestration platform

**Why it's needed:** Required for running Kubernetes locally via kind (Kubernetes in Docker). All backend and frontend services run in Docker containers during local development.

**Version requirement:** Docker 20.10 or higher

#### Installation

**Windows:**
```powershell
# Option 1: winget (recommended)
winget install Docker.DockerDesktop

# Option 2: Download installer
# Visit: https://docs.docker.com/desktop/install/windows-install/
```

**macOS:**
```bash
# Option 1: Homebrew (recommended)
brew install --cask docker

# Option 2: Download installer
# Visit: https://docs.docker.com/desktop/install/mac-install/
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io

# Fedora/RHEL
sudo dnf install docker

# Arch
sudo pacman -S docker

# Add user to docker group (avoid sudo)
sudo usermod -aG docker $USER
newgrp docker
```

#### Verification
```bash
# Check Docker is installed
docker --version

# Check Docker daemon is running
docker ps

# Expected output: List of running containers (may be empty)
```

**Troubleshooting:**
- **Windows/macOS:** Start Docker Desktop application and wait for "Running" status
- **Linux:** Start Docker service: `sudo systemctl start docker`

---

### 2. Git

**What it is:** Distributed version control system

**Why it's needed:** Required for cloning the repository, managing branches, and committing changes.

**Version requirement:** Git 2.x or higher (latest stable recommended)

#### Installation

**Windows:**
```powershell
# Option 1: winget (recommended)
winget install Git.Git

# Option 2: Download installer
# Visit: https://git-scm.com/download/win
```

**macOS:**
```bash
# Option 1: Homebrew (recommended)
brew install git

# Option 2: Xcode Command Line Tools
xcode-select --install

# Option 3: Download installer
# Visit: https://git-scm.com/download/mac
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install git

# Fedora/RHEL
sudo dnf install git

# Arch
sudo pacman -S git
```

#### Verification
```bash
# Check Git is installed
git --version

# Expected output: git version 2.x.x
```

#### Configuration (First-Time Setup)
```bash
# Set your name and email (required for commits)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Verify configuration
git config --list
```

---

### 3. Java 21 (Temurin/OpenJDK)

**What it is:** Java Development Kit (JDK)

**Why it's needed:** Required for building and running backend Spring Boot services (agent, client, transaction). The project uses Java 21 features and Spring Boot 3.x, which requires Java 21.

**Version requirement:** Exactly Java 21 (not Java 17 or older)

#### Installation

**Windows:**
```powershell
# Option 1: winget (recommended)
winget install EclipseAdoptium.Temurin.21.JDK

# Option 2: Download installer
# Visit: https://adoptium.net/temurin/releases/?version=21
```

**macOS:**
```bash
# Option 1: Homebrew (recommended)
brew install openjdk@21

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Option 2: Download installer
# Visit: https://adoptium.net/temurin/releases/?version=21
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install openjdk-21-jdk

# Fedora/RHEL
sudo dnf install java-21-openjdk-devel

# Arch
sudo pacman -S jdk21-openjdk

# Set JAVA_HOME (add to ~/.bashrc or ~/.zshrc)
echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk' >> ~/.bashrc
source ~/.bashrc
```

#### Verification
```bash
# Check Java version
java --version

# Expected output:
# openjdk 21.x.x
# (or similar with Java 21.x)

# Check JAVA_HOME
echo $JAVA_HOME

# Expected output: Path to Java 21 installation
```

**Troubleshooting:**
- If you have multiple Java versions, ensure Java 21 is the default:
  - Windows: Use `winget` to install and it will set the default
  - macOS: Use `brew install openjdk@21` and follow the PATH instructions
  - Linux: Use `sudo update-alternatives --config java` to select Java 21

---

### 4. Node.js ≥ 18

**What it is:** JavaScript runtime built on Chrome's V8 engine

**Why it's needed:** Required for building and running the React 19 frontend (crm-ui) with Vite build tooling. Modern frontend dependencies require Node.js 18 or higher.

**Version requirement:** Node.js 18.x or higher (LTS recommended)

#### Installation

**Windows:**
```powershell
# Option 1: winget (recommended)
winget install OpenJS.NodeJS.LTS

# Option 2: Download installer
# Visit: https://nodejs.org/en/download/
```

**macOS:**
```bash
# Option 1: Homebrew (recommended)
brew install node@18

# Option 2: nvm (Node Version Manager) - for managing multiple versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Option 3: Download installer
# Visit: https://nodejs.org/en/download/
```

**Linux:**
```bash
# Ubuntu/Debian (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora/RHEL
sudo dnf install nodejs npm

# Arch
sudo pacman -S nodejs npm

# Or use nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Verification
```bash
# Check Node.js version
node --version

# Expected output: v18.x.x or higher

# Check npm version
npm --version

# Expected output: 8.x.x or higher
```

**Troubleshooting:**
- If you have an older Node.js version, use nvm to install and switch to Node 18:
  ```bash
  nvm install 18
  nvm alias default 18
  nvm use 18
  ```

---

### 5. Make (GNU Make)

**What it is:** Build automation tool

**Why it's needed:** Required for running Makefile targets that orchestrate Kubernetes operations (`make k8s-validate`, `make kind-up`, `make build-images`, etc.).

**Version requirement:** GNU Make 3.8 or higher

#### Installation

**Windows:**

Make is not natively available on Windows. You have two options:

**Option 1: Git Bash (Recommended)**
```powershell
# Git for Windows includes make in Git Bash
winget install Git.Git

# After installation, make will be available in Git Bash at:
# C:\Program Files\Git\usr\bin\make.exe
```

**Option 2: Chocolatey**
```powershell
# Install Chocolatey first: https://chocolatey.org/install
choco install make
```

**Option 3: Scoop**
```powershell
# Install Scoop first: https://scoop.sh/
scoop install make
```

**macOS:**
```bash
# Make is usually pre-installed on macOS
# If not, install via Xcode Command Line Tools:
xcode-select --install

# Or via Homebrew:
brew install make
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install make

# Fedora/RHEL
sudo dnf install make

# Arch
sudo pacman -S make
```

#### Verification
```bash
# Check Make is installed
make --version

# Expected output: GNU Make 3.x or 4.x
```

**Windows Note:** If using Git Bash, you may need to use the full path:
```powershell
"C:\Program Files\Git\usr\bin\make.exe" --version
```

---

### 6. Python 3.8+

**What it is:** High-level programming language

**Why it's needed:**
- Required for cross-platform build scripts (`scripts/pipelines/*.py`)
- Required for the Python backend service (`services/backend/log` - FastAPI)
- Used for HTML report generation and test orchestration

**Version requirement:** Python 3.8 or higher (3.10+ recommended)

#### Installation

**See the dedicated guide:** [Python Installation Guide](PYTHON-REQUIREMENT.md)

This guide covers:
- Windows installation (winget, Chocolatey, or manual)
- macOS installation (Homebrew or manual)
- Linux installation (apt, dnf, pacman)
- Verification steps
- PATH configuration
- First-time setup with the bootstrap script

---

## Optional Dependencies

### Visual Studio Code (Recommended)

**What it is:** Lightweight code editor with extensive extension ecosystem

**Why it's recommended:**
- Project includes `.vscode/` configuration with recommended extensions
- Integrated terminal, debugging, and Git support
- Language-specific tooling for Java, TypeScript, Python

#### Installation

**All Platforms:**
- Download from: [https://code.visualstudio.com/](https://code.visualstudio.com/)

**Windows:**
```powershell
winget install Microsoft.VisualStudioCode
```

**macOS:**
```bash
brew install --cask visual-studio-code
```

**Linux:**
```bash
# Snap (Ubuntu and others)
sudo snap install code --classic

# Or download .deb/.rpm from website
```

**Recommended Extensions:**
After opening the project in VS Code, install the recommended extensions when prompted, or manually install:
- Java Extension Pack
- Spring Boot Extension Pack
- ESLint
- Prettier
- Python
- Docker
- Kubernetes

---

## Verification Script

To verify all prerequisites are correctly installed, run the doctor mode of the setup script:

```bash
# Checks all dependencies without making changes
python scripts/pipelines/setup_dev_env.py --doctor
```

This will:
- ✅ Check if all required tools are installed
- ✅ Verify versions meet minimum requirements
- ✅ Report what's missing or outdated
- ✅ Provide actionable fixes for each issue

**Exit code:**
- `0` - All prerequisites satisfied, ready for setup
- `1` - Issues found, review the output for fixes

---

## Next Steps

After installing all prerequisites:

1. **Run the setup script:**
   ```bash
   python scripts/pipelines/setup_dev_env.py
   ```
   This will automatically install CLI tools and configure dependencies.

2. **Follow the onboarding guide:**
   - [New Developer Setup](../onboarding/new-dev-setup.md) - Complete step-by-step guide
   - [Main README](../../README.md#-quickstart-3-commands) - Quick start commands

3. **Start developing:**
   - Run tests: `python scripts/pipelines/test_all.py`
   - Deploy locally: `python scripts/pipelines/deploy_k8s.py`
   - See: [Testing Guide](../testing/TESTING-GUIDE.md)

---

## Troubleshooting

### General Issues

**Issue:** "Command not found" after installation
**Fix:** Restart your terminal to refresh PATH environment variable

**Issue:** Version is too old
**Fix:** Uninstall old version first, then install the required version

**Issue:** Multiple versions installed
**Fix:**
- Java: Use `update-alternatives` (Linux) or reinstall correct version
- Node.js: Use `nvm` to manage versions
- Python: Use `pyenv` or reinstall correct version

### Platform-Specific Issues

**Windows:**
- If `winget` is not available, update Windows or use Chocolatey/Scoop
- If Git Bash make is not found, add `C:\Program Files\Git\usr\bin` to PATH

**macOS:**
- If Homebrew is not installed, install from [https://brew.sh/](https://brew.sh/)
- If command line tools are missing, run `xcode-select --install`

**Linux:**
- If package manager fails, update package lists first: `sudo apt-get update`
- If permission denied for Docker, add user to docker group: `sudo usermod -aG docker $USER`

### Still Having Issues?

1. **Check the comprehensive troubleshooting guide:** [Troubleshooting Guide](../troubleshooting.md)
2. **Run doctor mode:** `python scripts/pipelines/setup_dev_env.py --doctor`
3. **Review setup script logs:** `build-logs/dev-setup/`
4. **Ask the team:** Open a GitHub issue or contact on team communication channels

---

## Summary

**Required for setup:** Docker, Git, Java 21, Node.js ≥18, Make, Python 3.8+

**Auto-installed by setup script:** kubectl, helm, kind, kubeconform (to `.devtools/bin`)

**Recommended:** Visual Studio Code with project extensions

**Verification:** `python scripts/pipelines/setup_dev_env.py --doctor`

---

**Last updated:** February 2026
**Maintained by:** CS301 ITSA Team
