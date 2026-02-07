# Docker-Based Testing for Setup Scripts

This directory contains Docker-based testing environments for validating the developer setup scripts without needing a full VM.

## 🎯 What This Tests

✅ **What you CAN test:**
- Tool detection logic (recognizes installed vs. missing tools)
- Portable tool downloads (kubectl, helm, kind, kubeconform)
- Environment configuration (npm ci, Python venv creation)
- Script error handling and diagnostics
- Different starting states (fresh vs. partially configured machines)
- Cross-platform compatibility (Linux/Ubuntu)

❌ **What you CANNOT test:**
- Docker Desktop installation (we're already inside Docker)
- Kind cluster creation (requires Docker-in-Docker, complex)
- Full end-to-end verification pipelines (need actual services)
- Windows-specific behavior (use VM for this)

For comprehensive testing including Docker and kind, use a VM (see main README).

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop must be running on your host machine
- PowerShell (for running test scripts)

### Run All Tests (Recommended First Step)
```powershell
# From repo root
.\scripts\dev-setup\test\test-docker.ps1
```

This runs `--doctor` mode on all test scenarios (fresh + partial environments). Takes ~2-3 minutes.

**Expected output:**
```
Testing Scenario: fresh
✓ Expected: Doctor mode found missing tools (exit code 1)

Testing Scenario: partial
✓ Expected: Doctor mode found missing tools (exit code 1)

All tests passed! ✓
```

---

## 📋 Test Scenarios

### Scenario 1: Fresh Ubuntu (No Dev Tools)
**Dockerfile**: `Dockerfile.ubuntu-fresh`

**Simulates**: Brand new developer machine with only:
- curl
- ca-certificates
- git

**Use case**: Test that the script correctly detects ALL missing tools.

**Run**:
```powershell
.\scripts\dev-setup\test\test-docker.ps1 -Scenario fresh -Mode doctor
```

### Scenario 2: Partial Ubuntu (Some Tools Installed)
**Dockerfile**: `Dockerfile.ubuntu-partial`

**Simulates**: Partially configured machine with:
- curl, git, make
- Java 21 (OpenJDK)
- Node.js 18

**Use case**: Test that the script:
- Detects already-installed tools and skips them
- Only downloads missing tools
- Idempotency works correctly

**Run**:
```powershell
.\scripts\dev-setup\test\test-docker.ps1 -Scenario partial -Mode doctor
```

---

## 🧪 Test Modes

### Mode 1: Doctor (Default)
**Command**: `--doctor`

**What it does**: Read-only diagnostics, no changes made

**Expected**: Exit code 1 (missing tools detected)

```powershell
.\scripts\dev-setup\test\test-docker.ps1 -Mode doctor
```

**Good for**: Quick sanity check (~1-2 min)

### Mode 2: Install
**Command**: `--skip-verify`

**What it does**: Actually downloads portable tools to `.devtools/bin`

**Expected**: Exit code 0 (installation succeeds)

```powershell
.\scripts\dev-setup\test\test-docker.ps1 -Mode install
```

**Good for**: Testing download logic, PATH updates (~5-10 min)

### Mode 3: Full
**Command**: (default, runs verification)

**What it does**: Full setup + verification sequence

**Expected**: May fail (Docker/kind not available in container)

```powershell
.\scripts\dev-setup\test\test-docker.ps1 -Mode full
```

**Good for**: Stress testing (will show limitations of container environment)

---

## 📁 Files in This Directory

```
scripts/dev-setup/test/
├── Dockerfile.ubuntu-fresh     # Fresh Ubuntu 22.04
├── Dockerfile.ubuntu-partial   # Ubuntu with Java/Node/Make
├── test-docker.ps1             # Automated test runner (PowerShell)
├── clean-for-testing.ps1       # Clean local env to simulate fresh machine
└── README.md                   # This file
```

---

## 🪟 Windows + WSL Testing (Recommended for Production Validation)

The Docker tests above validate Linux behavior, but **do NOT test Windows+WSL-specific code paths** (including our recent fixes for Chocolatey shims, WSL PATH setup, and .exe suffix handling).

### Option A: Clean Your Current Windows Machine

Simulate a fresh state without needing a VM:

```powershell
# Step 1: Clean up to simulate fresh machine
.\scripts\dev-setup\test\clean-for-testing.ps1

# Step 2: Run setup as if fresh
.\scripts\dev-setup\setup.ps1

# OR: Test just the deployment pipeline
.\scripts\dev-setup\setup.ps1 -DeployOnly
```

**What gets cleaned:**
- `.devtools/` directory (portable tools)
- `cs301-crm` kind cluster
- `.k8s-validate-tmp/` directory
- Old build logs (>7 days)

**What stays intact:**
- System-installed tools (Docker, Java, Node, etc.)
- Chocolatey installations
- WSL installation

**For thorough cleaning** (also removes Docker images and build artifacts):
```powershell
.\scripts\dev-setup\test\clean-for-testing.ps1 -FullClean
```

### Option B: Fresh Windows VM (Gold Standard)

For true fresh-machine testing:

**Setup:**
1. Create Windows 10/11 VM (Hyper-V, VirtualBox, or Azure)
2. Install only base prerequisites:
   - Docker Desktop
   - Git
   - WSL (automatically installed by Docker Desktop on Windows)

**Test:**
```powershell
# Clone repo
git clone https://github.com/cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3.git
cd project-2025-26-t2-project-2025-26t2-g2-t3

# Run full setup
.\scripts\dev-setup\setup.ps1
```

**Critical validations for Windows+WSL:**
- ✅ Real kubectl/helm/kind binaries copied (not 392KB Chocolatey shims)
- ✅ WSL bash can find tools in PATH
- ✅ K8s validation passes with .exe suffix handling
- ✅ Make commands work on Windows
- ✅ Full deployment pipeline succeeds

### Option C: GitHub Actions / Cloud CI

For automated Windows testing in CI:

```yaml
# Example .github/workflows/test-windows-setup.yml
name: Test Windows Setup
on: [push, pull_request]

jobs:
  test-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run setup script
        run: .\scripts\dev-setup\setup.ps1 -DeployOnly
```

---

## 🔍 Manual Testing (Step-by-Step)

If you want to run tests manually for debugging:

### Step 1: Build a Test Image
```powershell
# From repo root
docker build -t setup-test-fresh `
  -f scripts/dev-setup/test/Dockerfile.ubuntu-fresh `
  .
```

### Step 2: Run the Container Interactively
```powershell
docker run -it --rm `
  -v "${PWD}:/home/developer/workspace" `
  setup-test-fresh `
  bash
```

You're now inside the container as the `developer` user.

### Step 3: Explore the Environment
```bash
# Check what's installed
which docker  # Should be missing
which kubectl # Should be missing
which java    # Should be missing (in fresh, present in partial)
which node    # Should be missing (in fresh, present in partial)

# Check the repo is mounted
ls -la scripts/dev-setup/
```

### Step 4: Run Setup Script Manually
```bash
# Doctor mode (read-only)
bash scripts/dev-setup/setup.sh --doctor

# See the issues detected
# Expected: Missing Docker, Java, Node, kubectl, helm, kind, etc.
```

### Step 5: Try Installing Portable Tools
```bash
# Install tools (portable mode)
bash scripts/dev-setup/setup.sh --skip-verify

# Check if tools were downloaded
ls -la .devtools/bin/
# Expected: kubectl, helm, kind, kubeconform

# Test the tools
.devtools/bin/kubectl version --client
.devtools/bin/helm version
```

### Step 6: Test Idempotency
```bash
# Re-run the setup
bash scripts/dev-setup/setup.sh --skip-verify

# Expected: Should skip already-downloaded tools
# Should complete quickly
```

### Step 7: Exit Container
```bash
exit
```

The container is destroyed, but `.devtools/` was created in your mounted repo (you can delete it).

---

## 🎓 Understanding the Test Results

### Expected Behavior: Fresh Environment
```
[k8s-validate] Checking required tools...
Missing required tool(s): helm kubectl kubeconform

[WARN] Docker : Docker daemon not running
[WARN] Java : Not found
[WARN] Node.js : Not found
[WARN] kubectl : Not found in PATH
[WARN] helm : Not found in PATH
[WARN] kind : Not found in PATH
[WARN] kubeconform : Not found in PATH

Found 7 issue(s):
  ❌ Docker
     Problem: Not found
     Fix: Install Docker Desktop from https://www.docker.com/...
  ❌ Java
     Problem: Not found
     Fix: Install Java 21 from https://adoptium.net/
  ...

Exit code: 1 (expected in doctor mode)
```

### Expected Behavior: Partial Environment
```
[✓] Java found: 21.0.1
[✓] Node.js found: 18.19.0
[WARN] kubectl : Not found in PATH
[WARN] helm : Not found in PATH
[WARN] kind : Not found in PATH

Found 3 issue(s):
  ❌ kubectl
  ❌ helm
  ❌ kind

Exit code: 1 (expected in doctor mode)
```

### Expected Behavior: Install Mode (Portable)
```
Downloading kubectl 1.31.0...
✓ kubectl installed to .devtools/bin

Downloading helm 3.17.0...
✓ helm installed to .devtools/bin

Downloading kind 0.26.0...
✓ kind installed to .devtools/bin

✓ All verification checks passed!
Exit code: 0 (success)
```

---

## ⚡ Quick Testing Workflow

### Daily Quick Check (1-2 min)
```powershell
# Verify no regressions
.\scripts\dev-setup\test\test-docker.ps1
```

### Before Committing Changes (5 min)
```powershell
# Test actual installation
.\scripts\dev-setup\test\test-docker.ps1 -Mode install

# Clean up .devtools/ if created
Remove-Item -Recurse -Force .devtools -ErrorAction SilentlyContinue
```

### Deep Testing (15 min)
```powershell
# Test all scenarios with installation
.\scripts\dev-setup\test\test-docker.ps1 -Scenario fresh -Mode install
.\scripts\dev-setup\test\test-docker.ps1 -Scenario partial -Mode install

# Manual exploration
docker run -it --rm -v "${PWD}:/home/developer/workspace" setup-test-fresh bash
```

---

## 🐛 Troubleshooting

### "docker: command not found"
**Fix**: Start Docker Desktop on your host machine.

### "Cannot connect to Docker daemon"
**Fix**: Ensure Docker Desktop is running (check system tray icon).

### "Permission denied" errors in container
**Fix**: The container runs as the `developer` user (non-root). This is intentional to simulate a real developer environment.

### Image build fails
**Fix**: 
```powershell
# Clean Docker cache
docker system prune -a

# Rebuild
docker build --no-cache -t setup-test-fresh -f scripts/dev-setup/test/Dockerfile.ubuntu-fresh .
```

### Tests pass in Docker but fail in real environment
**Limitation**: Docker testing has limitations (no Docker Desktop, no kind). Use a VM for comprehensive testing.

---

## 🔄 Adding New Test Scenarios

### Example: Test with Python Pre-installed

Create `Dockerfile.ubuntu-python`:
```dockerfile
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl ca-certificates git make \
    openjdk-21-jdk \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER developer
WORKDIR /home/developer/workspace
CMD ["bash", "scripts/dev-setup/setup.sh", "--doctor"]
```

Run:
```powershell
docker build -t setup-test-python -f scripts/dev-setup/test/Dockerfile.ubuntu-python .
docker run --rm -v "${PWD}:/home/developer/workspace" setup-test-python
```

---

## 📊 Comparison: Testing Approaches

| Aspect | Docker (Linux) | Windows Clean | Windows VM | Cloud CI |
|--------|----------------|---------------|------------|----------|
| **Setup time** | 30 seconds | 2 minutes | 15-30 minutes | 5 minutes |
| **Test duration** | 1-5 minutes | 5-10 minutes | 10-60 minutes | 10-15 minutes |
| **Tests WSL fixes** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Completeness** | ~60% | ~90% | 100% | 100% |
| **Reproducibility** | Excellent | Good | Excellent | Excellent |
| **Cost** | Free | Free | Free (local) / Paid (cloud) | Free (GitHub Actions) |
| **Best for** | Quick validation | Daily testing | Final acceptance | Automated testing |

**Recommendation**: 
- **Development**: Use `clean-for-testing.ps1` + `setup.ps1` on your Windows machine
- **Pre-commit**: Run Docker tests for quick validation
- **Pre-release**: Full VM test to ensure everything works from scratch
- **CI/CD**: GitHub Actions for automated regression testing

---

## 🎯 Next Steps

1. ✅ Run quick test: `.\scripts\dev-setup\test\test-docker.ps1`
2. ✅ If passes: Ready for basic validation
3. ⚠️ For full confidence: Test in a VM (see main project README)
4. 🚀 Add to CI: Consider GitHub Actions workflow for automated testing

---

## 📚 Related Documentation

- [Main Setup Script Docs](../README.md)
- [New Developer Onboarding Guide](../../../docs/onboarding/new-dev-setup.md)
- [VM Testing Guide](../../../docs/onboarding/new-dev-setup.md#vm-testing)

---

**Last updated**: February 7, 2026
