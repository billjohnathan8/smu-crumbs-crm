# WSL PATH Inheritance Fix

**Date:** 2026-02-09
**Issue:** `kind: command not found` error when running deploy scripts in WSL
**Root Cause:** Bash scripts called by Make don't inherit PATH from PowerShell or Make exports
**Status:** ✅ Fixed

## Problem Description

When running `.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1 -DeployOnly` on a Windows machine with WSL, the deployment fails with:

```
[kind-up] Attempt 1/3: Creating kind cluster cs301-crm...
scripts/platform/kind-up.sh: line 30: kind: command not found
```

This happens even though:
1. The setup script successfully installs `kind`, `kubectl`, `helm`, and `kubeconform` to `.devtools/bin`
2. PowerShell adds `.devtools\bin` to its session PATH
3. The Makefile exports `.devtools/bin` to PATH (line 10)

## Root Cause Analysis

### Why the Tools Can't Be Found

1. **Setup installs to `.devtools/bin`**: The PowerShell setup script correctly installs CLI tools to `.devtools/bin` (a portable install strategy)

2. **PowerShell PATH doesn't transfer to WSL**: When PowerShell calls Make, and Make calls bash scripts, those bash scripts run in WSL with a fresh shell environment

3. **Make PATH export uses Windows paths**: The Makefile exports `$(CURDIR)/.devtools/bin:$(PATH)`, but in WSL, this Windows-style path doesn't work

4. **Inconsistent PATH logic across scripts**:
   - ✅ `validate.sh` - Had proper WSL PATH detection (lines 23-56)
   - ✅ `smoke-k8s-infra.sh` - Had proper WSL PATH detection
   - ✅ `smoke-probes.sh` - Had proper WSL PATH detection
   - ❌ `kind-up.sh` - Only checked hardcoded Chocolatey paths, not `.devtools/bin`
   - ❌ `infra-up.sh` - Only checked hardcoded Chocolatey paths, not `.devtools/bin`

### The Friend's Observation

Your friend mentioned that "if your docker/kind binaries are in the program files folder, it won't run properly bc of the space."

This is partially correct - the real issue is:
- Scripts like `kind-up.sh` had **hardcoded paths** like `/mnt/c/ProgramData/chocolatey/bin/kind.exe`
- They didn't check `.devtools/bin` at all
- They didn't have dynamic PATH detection for different Windows environments

## Solution

### 1. Created Common Environment Setup Script

**File:** `scripts/common/setup-env.sh`

This script:
- Detects the platform (WSL, Git Bash, native Linux/macOS)
- Adds `.devtools/bin` to PATH with proper Unix-style paths
- Adds common Windows tool locations (Chocolatey, Docker Desktop)
- Exports command variables: `KUBECTL_CMD`, `HELM_CMD`, `KIND_CMD`, `KUBECONFORM_CMD`
- Provides `find_cmd()` function that handles `.exe` suffix for WSL
- Provides `to_native_path()` helper for path translation

### 2. Updated Problematic Scripts

**Updated `scripts/platform/kind-up.sh`:**
```bash
# Before:
if [[ -f /mnt/c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/mnt/c/ProgramData/chocolatey/bin/kubectl.exe
    KIND=/mnt/c/ProgramData/chocolatey/bin/kind.exe
elif [[ -f /c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/c/ProgramData/chocolatey/bin/kubectl.exe
    KIND=/c/ProgramData/chocolatey/bin/kind.exe
else
    KUBECTL=$(command -v kubectl || echo kubectl)
    KIND=$(command -v kind || echo kind)
fi

# After:
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"
KUBECTL="${KUBECTL_CMD}"
KIND="${KIND_CMD}"
```

**Updated `scripts/platform/infra-up.sh`:**
```bash
# Before:
if [[ -f /mnt/c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/mnt/c/ProgramData/chocolatey/bin/kubectl.exe
    HELM=/mnt/c/ProgramData/chocolatey/bin/helm.exe
elif [[ -f /c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/c/ProgramData/chocolatey/bin/kubectl.exe
    HELM=/c/ProgramData/chocolatey/bin/helm.exe
else
    KUBECTL=$(command -v kubectl || echo kubectl)
    HELM=$(command -v helm || echo helm)
fi

# After:
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"
KUBECTL="${KUBECTL_CMD}"
HELM="${HELM_CMD}"
```

## Benefits of This Approach

1. **Consistent**: All bash scripts now source the same environment setup
2. **Portable**: Works across Windows (PowerShell, WSL, Git Bash), macOS, and Linux
3. **Maintainable**: One source of truth for PATH logic - update once, applies everywhere
4. **Robust**: Handles edge cases like:
   - Tools with `.exe` suffix in WSL
   - Spaces in Windows paths (e.g., "Program Files")
   - Multiple tool installation locations
   - Missing tools (falls back gracefully)

## Testing

To test the fix on a fresh Windows machine with WSL:

```powershell
# 1. Clean install
.\scripts\dev-setup\setup.ps1 -DeployOnly

# 2. Verify tools are installed to .devtools/bin
ls .devtools\bin
# Should show: kubectl, helm, kind, kubeconform (or .exe versions)

# 3. Check that kind-up works
wsl bash scripts/platform/kind-up.sh
# Should successfully create the cluster (not "command not found")

# 4. Full deployment test
.\scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1
```

## Future Improvements

Consider updating other bash scripts to source `setup-env.sh`:
- `scripts/validate-k8s/validate.sh` - Already has the logic, but could use common script
- `scripts/smoke-k8s-infra/smoke-k8s-infra.sh` - Already has the logic, but could use common script
- `scripts/smoke-k8s-infra/smoke-probes.sh` - Already has the logic, but could use common script
- Any new bash scripts added to the repo

## Related Issues

- **Issue:** Docker build fails on Windows due to Python venv symlinks
  - **Fix:** Added `.dockerignore` to `services/backend/log/`
- **Issue:** Docker Desktop creates conflicting "desktop" kind cluster on port 8443
  - **Fix:** Dev setup scripts auto-clean this cluster

## Files Changed

- ✅ `scripts/common/setup-env.sh` (new)
- ✅ `scripts/platform/kind-up.sh` (updated)
- ✅ `scripts/platform/infra-up.sh` (updated)
- ✅ `memory/MEMORY.md` (documented)
- ✅ `docs/fixes/wsl-path-inheritance-fix.md` (this file)
