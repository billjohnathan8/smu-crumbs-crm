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
└── README.md                   # This file
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

## 📊 Comparison: Docker vs. VM Testing

| Aspect | Docker | VM (Hyper-V/VirtualBox) |
|--------|--------|-------------------------|
| **Setup time** | 30 seconds | 15-30 minutes |
| **Test duration** | 1-5 minutes | 10-60 minutes |
| **Completeness** | ~60% (no Docker/kind) | 100% (full e2e) |
| **Reproducibility** | Excellent | Good (with snapshots) |
| **Cost** | Free | Free (local) or paid (cloud) |
| **Best for** | Quick validation, CI/CD | Final acceptance testing |

**Recommendation**: Use Docker for rapid iteration and development, VM for final validation before release.

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
