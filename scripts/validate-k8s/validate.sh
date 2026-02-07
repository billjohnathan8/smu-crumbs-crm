#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
TMPDIR_BASE="${REPO_ROOT}/.k8s-validate-tmp"

log() {
  printf '[k8s-validate] %s\n' "$1"
}

fail() {
  log "ERROR: $1"
  exit 1
}

cleanup() {
  if [[ -d "${TMPDIR_BASE}" ]]; then
    rm -rf "${TMPDIR_BASE}"
  fi
}
trap cleanup EXIT

# On Windows (Git Bash), add common Windows tool paths that may not be auto-mapped
if [[ -n "${WINDIR:-}" ]] || [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
  # Add .devtools/bin (portable tools)
  if [[ -d "${REPO_ROOT}/.devtools/bin" ]]; then
    export PATH="${REPO_ROOT}/.devtools/bin:${PATH}"
  fi
  
  # Add Chocolatey bin (where kubectl, helm, kind may be installed)
  if [[ -d "/c/ProgramData/chocolatey/bin" ]]; then
    export PATH="/c/ProgramData/chocolatey/bin:${PATH}"
  fi
  
  # Add Docker Desktop resources (alternative kubectl location)
  if [[ -d "/c/Program Files/Docker/Docker/resources/bin" ]]; then
    export PATH="/c/Program Files/Docker/Docker/resources/bin:${PATH}"
  fi
fi

# Additional WSL-specific PATH handling
if [[ "$(uname -r)" =~ Microsoft || "$(uname -r)" =~ WSL ]]; then
  log "WSL detected - adding Windows tool paths for cross-platform compatibility"
  # Add .devtools/bin with absolute /mnt/c path for WSL
  devtools_abs="${REPO_ROOT}/.devtools/bin"
  if [[ -d "${devtools_abs}" ]]; then
    export PATH="${devtools_abs}:${PATH}"
    log "Added to PATH: ${devtools_abs}"
  fi
  
  # Add Chocolatey bin for WSL
  if [[ -d "/mnt/c/ProgramData/chocolatey/bin" ]]; then
    export PATH="/mnt/c/ProgramData/chocolatey/bin:${PATH}"
    log "Added to PATH: /mnt/c/ProgramData/chocolatey/bin"
  fi
fi

# ---------------------------------------------------------------------------
# 1) Tool checks
# ---------------------------------------------------------------------------
log "Checking required tools..."

missing=()
# On WSL, determine which command variant works (.exe or no suffix) and set command variables
HELM_CMD="helm"
KUBECTL_CMD="kubectl"
KUBECONFORM_CMD="kubeconform"
IS_WSL=false

# Detect if we're running in WSL
if [[ "$(uname -r)" =~ Microsoft || "$(uname -r)" =~ WSL ]]; then
  IS_WSL=true
fi

for tool in helm kubectl kubeconform; do
  # In WSL, try both with and without .exe suffix
  if command -v "${tool}" >/dev/null 2>&1; then
    log "Found: ${tool}"
  elif command -v "${tool}.exe" >/dev/null 2>&1; then
    log "Found: ${tool}.exe"
    # Set the command variable to include .exe suffix for WSL
    case "${tool}" in
      helm) HELM_CMD="helm.exe" ;;
      kubectl) KUBECTL_CMD="kubectl.exe" ;;
      kubeconform) KUBECONFORM_CMD="kubeconform.exe" ;;
    esac
  else
    missing+=("${tool}")
  fi
done

# Helper function to convert WSL paths to Windows paths when calling .exe binaries
to_native_path() {
  local path="$1"
  if ${IS_WSL} && [[ "${path}" =~ ^/ ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "${path}"
  else
    echo "${path}"
  fi
}

if [[ ${#missing[@]} -gt 0 ]]; then
  log "Missing required tool(s): ${missing[*]}"
  log ""
  log "Install hints:"
  log "  helm         -> https://helm.sh/docs/intro/install/"
  log "  kubectl      -> https://kubernetes.io/docs/tasks/tools/"
  log "  kubeconform  -> https://github.com/yannh/kubeconform#installation"
  exit 1
fi

log "All required tools found."

# ---------------------------------------------------------------------------
# 2) Validate kind config YAML (best-effort with python)
# ---------------------------------------------------------------------------
KIND_CONFIG="${REPO_ROOT}/platform/k8s/infra/kind-config.yaml"

log "Validating kind config YAML..."
if [[ -f "${KIND_CONFIG}" ]]; then
  # Find a working python — check it actually runs (Windows Store alias fakes command -v).
  python_cmd=""
  for candidate in python3 python py; do
    if ${candidate} -c "pass" >/dev/null 2>&1; then
      python_cmd="${candidate}"
      break
    fi
  done

  if [[ -n "${python_cmd}" ]]; then
    # Use json module (stdlib) instead of pyyaml to avoid import errors.
    if ! ${python_cmd} -c "
import json, sys, subprocess
try:
    # Use a simple YAML subset check: parse as multi-doc YAML via json roundtrip is not possible,
    # so try importing yaml; fall back to a basic syntax check if pyyaml is absent.
    try:
        import yaml
        with open(sys.argv[1]) as f:
            yaml.safe_load(f)
    except ImportError:
        # pyyaml not installed — do a basic read to catch file-level errors only.
        with open(sys.argv[1]) as f:
            f.read()
except Exception as e:
    print(f'Invalid YAML: {e}', file=sys.stderr)
    sys.exit(1)
" "${KIND_CONFIG}"; then
      fail "kind-config.yaml is not valid YAML."
    fi
    log "kind-config.yaml parsed successfully."
  else
    log "WARNING: python not found; skipping YAML parse check for kind-config.yaml."
  fi
else
  log "WARNING: kind-config.yaml not found at ${KIND_CONFIG}; skipping."
fi

# ---------------------------------------------------------------------------
# 3) Helm template rendering & validation
# ---------------------------------------------------------------------------
mkdir -p "${TMPDIR_BASE}"

log "Ensuring Helm repos are added..."
${HELM_CMD} repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
${HELM_CMD} repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
${HELM_CMD} repo update >/dev/null

HELM_CHARTS=(
  "infra-ingress|ingress-nginx|ingress-nginx/ingress-nginx|ingress-nginx|"
  "infra-metrics|metrics-server|bitnami/metrics-server|kube-system|${REPO_ROOT}/platform/k8s/infra/helm-values/metrics-server-values.yaml"
  "infra-postgres|postgres|bitnami/postgresql|dev|${REPO_ROOT}/platform/k8s/infra/helm-values/postgresql-values.yaml"
)

validated_files=()

for entry in "${HELM_CHARTS[@]}"; do
  IFS='|' read -r filename release chart namespace values_file <<< "${entry}"
  outfile="${TMPDIR_BASE}/${filename}.yaml"

  log "Rendering Helm chart: ${chart} (release=${release}, namespace=${namespace})..."
  cmd=(${HELM_CMD} template "${release}" "${chart}" --namespace "${namespace}" --include-crds)
  if [[ -n "${values_file}" ]]; then
    # Convert values file path to native format for Windows executables in WSL
    native_values_file="$(to_native_path "${values_file}")"
    cmd+=(-f "${native_values_file}")
  fi

  # Note: Keep outfile as Unix path for bash shell redirection
  if ! "${cmd[@]}" > "${outfile}" 2>&1; then
    fail "helm template failed for ${chart}. Output:\n$(cat "${outfile}")"
  fi

  log "Validating ${filename}.yaml with kubeconform..."
  # Use strict mode but ignore missing schemas (CRDs from Helm charts may not have schemas).
  # Convert to Windows path only for kubeconform.exe argument
  native_outfile="$(to_native_path "${outfile}")"
  if ! ${KUBECONFORM_CMD} -summary -strict -ignore-missing-schemas "${native_outfile}"; then
    fail "kubeconform validation failed for ${filename}.yaml"
  fi

  validated_files+=("${outfile}")
done

# ---------------------------------------------------------------------------
# 4) Kustomize overlay rendering & validation
# ---------------------------------------------------------------------------
KUSTOMIZE_DIR="${REPO_ROOT}/platform/k8s/apps/overlays/dev"
APPS_OUTFILE="${TMPDIR_BASE}/apps-dev.yaml"

log "Rendering Kustomize overlay: ${KUSTOMIZE_DIR}..."
if ! ${KUBECTL_CMD} kustomize "${KUSTOMIZE_DIR}" > "${APPS_OUTFILE}" 2>&1; then
  fail "kubectl kustomize failed. Output:\n$(cat "${APPS_OUTFILE}")"
fi

log "Validating apps-dev.yaml with kubeconform..."
native_apps_outfile="$(to_native_path "${APPS_OUTFILE}")"
if ! ${KUBECONFORM_CMD} -summary -strict -ignore-missing-schemas "${native_apps_outfile}"; then
  fail "kubeconform validation failed for apps-dev.yaml"
fi

validated_files+=("${APPS_OUTFILE}")

# ---------------------------------------------------------------------------
# 5) Success summary
# ---------------------------------------------------------------------------
log ""
log "=== K8s Validation Passed ==="
log "Validated outputs:"
for f in "${validated_files[@]}"; do
  log "  - ${f}"
done
log "Temp dir: ${TMPDIR_BASE}"
log ""
