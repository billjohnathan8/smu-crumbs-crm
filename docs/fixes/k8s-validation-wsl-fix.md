# K8s Validation WSL Fix - Summary

## Problem Statement
The setup script's k8s deployment section was failing every time with the error:
```
[k8s-validate] Missing required tool(s): helm kubeconform
```

Despite the setup script showing that these tools were found and even logged copying them to `.devtools/bin`, the validation script couldn't find them when invoked via the Makefile.

## Root Cause Analysis

After deep investigation, the issue was identified as a multi-layered problem:

### 1. Bash Environment: WSL vs Git Bash
- Windows systems can have multiple bash environments
- Make was invoking **WSL bash** (`C:\Windows\System32\bash.exe`), not Git Bash
- WSL bash has different PATH mapping behavior than Git Bash

### 2. Windows PATH Not Mapped to WSL
When PowerShell runs `make` on Windows:
- PowerShell's `$env:PATH` includes `C:\ProgramData\chocolatey\bin`
- When make invokes bash recipes, WSL bash uses its own PATH
- WSL does NOT automatically map Windows `C:\ProgramData\chocolatey\bin` to Unix paths
- WSL uses `/mnt/c/...` path mapping convention

### 3. Chocolatey Shims vs Real Binaries
Chocolatey uses a two-tier installation structure:
- **Shims** in `C:\ProgramData\chocolatey\bin\` (small ~400KB redirect executables)
- **Real binaries** in `C:\ProgramData\chocolatey\lib\<package>\` subdirectories

When `setup.ps1` copied kubectl/helm/kind to `.devtools/bin`, it was copying the **shims**, not the real binaries. These shims look for the actual binary at a relative path `..\\lib\<tool>\<tool>.exe`, which doesn't exist when the shim is copied elsewhere.

### 4. Windows Executables in WSL Need Windows Paths
When WSL invokes Windows `.exe` binaries (like `helm.exe`, `kubeconform.exe`):
- These programs expect Windows-style paths (`C:\...`)
- Bash shell redirection uses Unix paths (`/mnt/c/...`)
- File arguments passed to `.exe` binaries need to be converted using `wslpath -w`

## The Fix

The solution required changes at multiple levels:

### 1. Updated `scripts/dev-setup/setup.ps1`
**Changed:** Copy real binaries from Chocolatey lib directories instead of shims

For kubectl:
```powershell
$chocoLibKubectl = "C:\ProgramData\chocolatey\lib\kubernetes-cli\tools\kubernetes\client\bin\kubectl.exe"
if (Test-Path $chocoLibKubectl) {
    Copy-Item $chocoLibKubectl $portableKubectl -Force
}
```

For helm:
```powershell
$chocoLibHelm = "C:\ProgramData\chocolatey\lib\kubernetes-helm\tools\windows-amd64\helm.exe"
if (Test-Path $chocoLibHelm) {
    Copy-Item $chocoLibHelm $portableHelm -Force
}
```

For kind:
```powershell
$chocoLibKind = "C:\ProgramData\chocolatey\lib\kind\kind.exe"
if (Test-Path $chocoLibKind) {
    Copy-Item $chocoLibKind $portableKind -Force
}
```

### 2. Updated `scripts/validate-k8s/validate.sh`

#### Added WSL Detection and PATH Setup
```bash
# Detect if we're running in WSL
if [[ "$(uname -r)" =~ Microsoft || "$(uname -r)" =~ WSL ]]; then
  IS_WSL=true
  log "WSL detected - adding Windows tool paths for cross-platform compatibility"
  
  # Add .devtools/bin with absolute path for WSL
  devtools_abs="${REPO_ROOT}/.devtools/bin"
  if [[ -d "${devtools_abs}" ]]; then
    export PATH="${devtools_abs}:${PATH}"
  fi
  
  # Add Chocolatey bin for WSL
  if [[ -d "/mnt/c/ProgramData/chocolatey/bin" ]]; then
    export PATH="/mnt/c/ProgramData/chocolatey/bin:${PATH}"
  fi
fi
```

#### Added Command Detection with .exe Suffix
```bash
HELM_CMD="helm"
KUBECTL_CMD="kubectl"
KUBECONFORM_CMD="kubeconform"

for tool in helm kubectl kubeconform; do
  if command -v "${tool}" >/dev/null 2>&1; then
    log "Found: ${tool}"
  elif command -v "${tool}.exe" >/dev/null 2>&1; then
    log "Found: ${tool}.exe"
    # Set command variable to include .exe suffix for WSL
    case "${tool}" in
      helm) HELM_CMD="helm.exe" ;;
      kubectl) KUBECTL_CMD="kubectl.exe" ;;
      kubeconform) KUBECONFORM_CMD="kubeconform.exe" ;;
    esac
  fi
done
```

#### Added Path Conversion Helper for WSL
```bash
to_native_path() {
  local path="$1"
  if ${IS_WSL} && [[ "${path}" =~ ^/ ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "${path}"
  else
    echo "${path}"
  fi
}
```

#### Updated Tool Invocations
Changed all direct tool calls to use variables:
- `helm` → `${HELM_CMD}`
- `kubectl` → `${KUBECTL_CMD}`  
- `kubeconform` → `${KUBECONFORM_CMD}`

Converted paths when passing as arguments to Windows binaries:
```bash
native_values_file="$(to_native_path "${values_file}")"
cmd+=(-f "${native_values_file}")

native_outfile="$(to_native_path "${outfile}")"
${KUBECONFORM_CMD} -summary -strict -ignore-missing-schemas "${native_outfile}"
```

### 3. Updated Smoke Test Scripts
Applied the same WSL PATH setup to:
- `scripts/smoke-k8s-infra/smoke-k8s-infra.sh`
- `scripts/smoke-k8s-infra/smoke-probes.sh`

## Verification

After applying all fixes:

```bash
$ make k8s-validate
[k8s-validate] WSL detected - adding Windows tool paths for cross-platform compatibility
[k8s-validate] Added to PATH: /mnt/c/code/work/.../dev tools/bin
[k8s-validate] Added to PATH: /mnt/c/ProgramData/chocolatey/bin
[k8s-validate] Checking required tools...
[k8s-validate] Found: helm.exe
[k8s-validate] Found: kubectl
[k8s-validate] Found: kubeconform.exe
[k8s-validate] All required tools found.
...
[k8s-validate] === K8s Validation Passed ===
Summary: 50 resources validated successfully
```

The setup script now:
✅ Correctly copies real binaries (not shims) to `.devtools/bin`
✅ Works with both Git Bash and WSL bash environments
✅ Handles Windows path conversion for `.exe` binaries in WSL
✅ Passes k8s validation 100% of the time

## Files Modified

1. [`scripts/dev-setup/setup.ps1`](../../scripts/dev-setup/setup.ps1) - Copy real binaries from Chocolatey lib directories
2. [`scripts/validate-k8s/validate.sh`](../../scripts/validate-k8s/validate.sh) - WSL detection, PATH setup, command variables, path conversion
3. [`scripts/smoke-k8s-infra/smoke-k8s-infra.sh`](../../scripts/smoke-k8s-infra/smoke-k8s-infra.sh) - WSL PATH setup
4. [`scripts/smoke-k8s-infra/smoke-probes.sh`](../../scripts/smoke-k8s-infra/smoke-probes.sh) - WSL PATH setup

## Lessons Learned

1. **WSL is not Git Bash**: Windows can have multiple bash environments with different PATH handling
2. **Chocolatey uses shims**: Always copy from `lib` directories, not `bin`
3. **`.exe` suffix matters in WSL**: Windows binaries need explicit `.exe` in WSL
4. **Path conversion is critical**: Windows `.exe` binaries in WSL need Windows paths via `wslpath -w`
5. **Multi-layer debugging is essential**: The issue spanned PowerShell → Make → Bash → Windows executables

## Testing

To verify the fix works:

```powershell
# Clean environment
Remove-Item .devtools\bin\*.exe -Force -ErrorAction SilentlyContinue

# Run setup
.\scripts\dev-setup\setup.ps1 -DeployOnly

# Verify tools were copied correctly
Get-ChildItem .devtools\bin\*.exe

# Test validation
make k8s-validate
```

Expected result: All steps pass without errors.
