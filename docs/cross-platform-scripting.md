# Cross-Platform Scripting Guide

**Last Updated:** February 2026

This guide documents the cross-platform scripting infrastructure used across the CS301-ITSA-Scroogebank-CRM project, ensuring consistent behavior on Windows (PowerShell, Git Bash, WSL), macOS, and Linux.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Common Environment Setup](#common-environment-setup)
- [Platform Detection](#platform-detection)
- [PATH Handling](#path-handling)
- [Key Fixes](#key-fixes)
- [Developer Guidelines](#developer-guidelines)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## Overview

The project uses a **unified environment setup strategy** for all bash scripts to ensure:
- ✅ Tools installed to `.devtools/bin` are always discoverable
- ✅ Paths with spaces (like `C:\Program Files\Git`) work correctly
- ✅ WSL, Git Bash, macOS, and Linux all work seamlessly
- ✅ No hardcoded paths or platform-specific hacks in individual scripts

**Key Innovation:** Single source of truth for environment setup: [scripts/common/setup-env.sh](../scripts/common/setup-env.sh)

---

## Common Environment Setup

### The Core Script

**File:** [scripts/common/setup-env.sh](../scripts/common/setup-env.sh)

All bash scripts in the project source this common setup script to:
1. Detect the platform (WSL, Git Bash, native Linux/macOS)
2. Add `.devtools/bin` to PATH with proper Unix-style paths
3. Export command variables: `KUBECTL_CMD`, `HELM_CMD`, `KIND_CMD`, `KUBECONFORM_CMD`
4. Provide helper functions for path translation (`to_native_path()`)

### Usage Pattern

Every bash script follows this pattern:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

# Use commands from common setup
KUBECTL="${KUBECTL_CMD}"
HELM="${HELM_CMD}"
KIND="${KIND_CMD}"

# Rest of script logic...
"$KUBECTL" get pods
"$HELM" list
"$KIND" create cluster
```

### Scripts Updated

- ✅ [scripts/platform/kind-up.sh](../scripts/platform/kind-up.sh)
- ✅ [scripts/platform/infra-up.sh](../scripts/platform/infra-up.sh)
- ✅ [scripts/validate-k8s/validate.sh](../scripts/validate-k8s/validate.sh) - Already had proper handling
- ✅ [scripts/smoke-k8s-infra/smoke-k8s-infra.sh](../scripts/smoke-k8s-infra/smoke-k8s-infra.sh) - Already had proper handling
- ✅ [scripts/smoke-k8s-infra/smoke-probes.sh](../scripts/smoke-k8s-infra/smoke-probes.sh) - Already had proper handling

---

## Platform Detection

The common setup script detects platforms using:

### WSL Detection
```bash
if [[ "$(uname -r)" =~ Microsoft || "$(uname -r)" =~ WSL ]]; then
    IS_WSL=true
    # Add /mnt/c/... paths
    # Handle .exe suffix for Windows executables
fi
```

### Git Bash Detection
```bash
if [[ -n "${WINDIR:-}" ]] || [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
    IS_GIT_BASH=true
    # Add /c/... paths
fi
```

### Native Linux/macOS
```bash
else
    # Native environment, use standard paths
fi
```

---

## PATH Handling

### Problem Solved

**Before:** Each script had hardcoded paths or inconsistent detection logic:
```bash
# ❌ Old approach (hardcoded, brittle)
if [[ -f /mnt/c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/mnt/c/ProgramData/chocolatey/bin/kubectl.exe
elif [[ -f /c/ProgramData/chocolatey/bin/kubectl.exe ]]; then
    KUBECTL=/c/ProgramData/chocolatey/bin/kubectl.exe
else
    KUBECTL=$(command -v kubectl || echo kubectl)  # Doesn't check .devtools/bin!
fi
```

**After:** Single dynamic PATH setup:
```bash
# ✅ New approach (dynamic, consistent)
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"
KUBECTL="${KUBECTL_CMD}"  # Automatically finds tool in .devtools/bin or system PATH
```

### Path Priority

The common setup adds paths in this order:
1. **`.devtools/bin`** - Tools installed by setup script (highest priority)
2. **Chocolatey bin** - Windows package manager (`/mnt/c/ProgramData/chocolatey/bin` for WSL)
3. **Docker Desktop resources** - Alternative kubectl location
4. **System PATH** - Fallback to system-installed tools

---

## Key Fixes

### 1. WSL PATH Inheritance Bug (Feb 2026)

**Issue:** Bash scripts called by Make don't inherit PATH from PowerShell or Make exports.

**Root Cause:**
- Setup script installs tools to `.devtools/bin` and updates PowerShell PATH
- Make exports `export PATH := $(CURDIR)/.devtools/bin:$(PATH)` (line 10 of Makefile)
- But when Make calls bash in WSL, the bash subprocess doesn't inherit Windows-style paths
- Scripts like `kind-up.sh` only looked for tools in hardcoded Chocolatey paths

**Solution:** Common environment setup script sourced by all bash scripts.

**Documentation:** [fixes/wsl-path-inheritance-fix.md](fixes/wsl-path-inheritance-fix.md)

---

### 2. Paths with Spaces Support

**Issue:** Paths like `C:\Program Files\Git` caused "No such file or directory" errors.

**Solution:**
- All variable expansions properly quoted
- Path translation functions handle spaces correctly
- WSL `wslpath -w` used for Windows path conversion

**Example:**
```bash
# Proper quoting
"$KUBECTL" apply -f "${manifest_file}"

# Path translation for .exe in WSL
native_path="$(to_native_path "${REPO_ROOT}/platform/k8s/apps")"
"$KUBECTL_CMD" kustomize "${native_path}"
```

---

### 3. .exe Suffix Handling in WSL

**Issue:** WSL needs `.exe` suffix for Windows executables, but Linux doesn't.

**Solution:** `find_cmd()` function tries both variants:
```bash
find_cmd() {
    local cmd="$1"
    # Try without .exe first
    if command -v "${cmd}" >/dev/null 2>&1; then
        echo "${cmd}"
    # Try with .exe (for WSL)
    elif command -v "${cmd}.exe" >/dev/null 2>&1; then
        echo "${cmd}.exe"
    else
        echo "${cmd}"  # Return base name, let caller handle error
    fi
}

export KUBECTL_CMD="$(find_cmd kubectl)"  # Becomes "kubectl" or "kubectl.exe" as needed
```

---

## Developer Guidelines

### Adding New Bash Scripts

When creating a new bash script that needs kubectl, helm, kind, or other tools:

1. **Always source the common setup at the top:**
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail

   # Source common environment setup
   source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"
   ```

2. **Use the exported command variables:**
   ```bash
   # Use these instead of hardcoding "kubectl", "helm", etc.
   KUBECTL="${KUBECTL_CMD}"
   HELM="${HELM_CMD}"
   KIND="${KIND_CMD}"
   KUBECONFORM="${KUBECONFORM_CMD}"
   ```

3. **Quote all variable expansions:**
   ```bash
   "$KUBECTL" get pods -n dev
   "$HELM" install nginx ingress-nginx/ingress-nginx
   ```

4. **Use `to_native_path()` when passing paths to Windows .exe in WSL:**
   ```bash
   if ${IS_WSL}; then
       native_path="$(to_native_path "${unix_path}")"
       "$KUBECTL_CMD" kustomize "${native_path}"
   fi
   ```

### Testing Across Platforms

When testing changes to bash scripts:

**Windows (Git Bash):**
```powershell
bash scripts/your-script.sh
```

**Windows (WSL):**
```powershell
wsl bash scripts/your-script.sh
```

**macOS/Linux:**
```bash
bash scripts/your-script.sh
```

**Test PATH detection:**
```bash
bash scripts/test-wsl-path-fix.sh
```

---

## Troubleshooting

### "kind: command not found" or similar tool errors

**Symptoms:**
```
scripts/platform/kind-up.sh: line 30: kind: command not found
```

**Solution:**
1. Verify tools are installed to `.devtools/bin`:
   ```powershell
   ls .devtools\bin  # Windows
   ls .devtools/bin   # macOS/Linux
   ```

2. Test PATH detection:
   ```bash
   bash scripts/test-wsl-path-fix.sh
   ```

3. Re-run setup if tools are missing:
   ```bash
   python scripts/pipelines/setup_dev_env.py
   ```

**See:** [Troubleshooting Guide](troubleshooting.md#issue-deployment-fails-with-kind-command-not-found-on-windowswsl)

---

### "/c/Program: No such file or directory"

**Symptoms:**
```
scripts/platform/kind-up.sh: line 32: /c/Program: No such file or directory
```

**Cause:** Path with spaces not properly quoted.

**Solution:** Already fixed in current scripts. If you see this:
1. Check if you're using an old version of the script
2. Ensure all variable expansions are quoted with `"$VAR"`
3. Re-run setup to get latest scripts

---

### Tools work in PowerShell but not in bash

**Cause:** PATH not inherited from PowerShell to WSL/Git Bash.

**Solution:** This is expected behavior and is why we use the common setup script. The common setup script adds `.devtools/bin` to PATH in every bash script.

**Verify:**
```bash
# In bash, check if PATH includes .devtools/bin
echo $PATH | grep devtools
```

---

## Related Documentation

### Implementation Details
- **[scripts/common/setup-env.sh](../scripts/common/setup-env.sh)** - Common environment setup script (source code)
- **[docs/fixes/wsl-path-inheritance-fix.md](fixes/wsl-path-inheritance-fix.md)** - Comprehensive fix documentation

### Usage Documentation
- **[README.md](../README.md)** - Main project readme
- **[docs/troubleshooting.md](troubleshooting.md)** - Troubleshooting guide with PATH issues section
- **[scripts/dev-setup/README.md](../scripts/dev-setup/README.md)** - Developer setup documentation
- **[scripts/build-and-deploy-k8s/README.md](../scripts/build-and-deploy-k8s/README.md)** - Deployment documentation
- **[docs/local-k8s-dev.md](local-k8s-dev.md)** - Local Kubernetes development guide

### Testing
- **[scripts/test-wsl-path-fix.sh](../scripts/test-wsl-path-fix.sh)** - Test script to verify PATH detection

---

## Summary

The cross-platform scripting infrastructure ensures:

✅ **Portable** - Tools in `.devtools/bin` work everywhere
✅ **Consistent** - Single source of truth for environment setup
✅ **Robust** - Handles edge cases (spaces in paths, .exe suffix, WSL/Git Bash differences)
✅ **Maintainable** - Update once in `setup-env.sh`, applies everywhere
✅ **Tested** - Works on Windows (PowerShell, Git Bash, WSL), macOS, and Linux

---

**Last Updated:** February 2026
**Maintained by:** CS301 ITSA Team
**Back to:** [Documentation Hub](README.md) | [Main README](../README.md)
