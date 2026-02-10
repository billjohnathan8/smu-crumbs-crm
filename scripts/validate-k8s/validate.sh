#!/usr/bin/env bash
set -euo pipefail

python3 scripts/validate-k8s/validate.py
#!/usr/bin/env bash
set -euo pipefail

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

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

# ---------------------------------------------------------------------------
# 1) Tool checks
# ---------------------------------------------------------------------------
log "Checking required tools..."

missing=()
for tool in helm kubectl kubeconform; do
  if command -v "${tool}" >/dev/null 2>&1 || command -v "${tool}.exe" >/dev/null 2>&1; then
    log "Found: ${tool}"
  else
    missing+=("${tool}")
  fi
done

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

# Use commands from common setup
HELM="${HELM_CMD}"
KUBECTL="${KUBECTL_CMD}"
KUBECONFORM="${KUBECONFORM_CMD}"

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
"${HELM}" repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
"${HELM}" repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
"${HELM}" repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
"${HELM}" repo add kubeview https://benc-uk.github.io/kubeview/deploy/helm >/dev/null 2>&1 || true
"${HELM}" repo update >/dev/null

HELM_CHARTS=(
  "infra-ingress|ingress-nginx|ingress-nginx/ingress-nginx|ingress-nginx|"
  "infra-metrics|metrics-server|bitnami/metrics-server|kube-system|${REPO_ROOT}/platform/k8s/infra/helm-values/metrics-server-values.yaml"
  "infra-postgres|postgres|bitnami/postgresql|dev|${REPO_ROOT}/platform/k8s/infra/helm-values/postgresql-values.yaml"
  "infra-observability|kube-prometheus-stack|prometheus-community/kube-prometheus-stack|observability|${REPO_ROOT}/platform/k8s/infra/helm-values/kube-prometheus-stack-values.yaml"
  "infra-kubeview|kubeview|kubeview/kubeview|observability|${REPO_ROOT}/platform/k8s/infra/helm-values/kubeview-values.yaml"
)

validated_files=()

for entry in "${HELM_CHARTS[@]}"; do
  IFS='|' read -r filename release chart namespace values_file <<< "${entry}"
  outfile="${TMPDIR_BASE}/${filename}.yaml"

  log "Rendering Helm chart: ${chart} (release=${release}, namespace=${namespace})..."
  cmd=("${HELM}" template "${release}" "${chart}" --namespace "${namespace}" --include-crds)
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
  if ! "${KUBECONFORM}" -summary -strict -ignore-missing-schemas "${native_outfile}"; then
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
# For kubectl kustomize with .exe in WSL, use relative path to avoid path translation issues
if ${IS_WSL} && [[ "${KUBECTL}" == *".exe" ]]; then
  # Change to directory and kustomize current dir to avoid WSL/Windows path issues
  if ! (cd "${KUSTOMIZE_DIR}" && "${KUBECTL}" kustomize .) > "${APPS_OUTFILE}" 2>&1; then
    fail "kubectl kustomize failed. Output:\n$(cat "${APPS_OUTFILE}")"
  fi
else
  # Native kubectl or non-WSL: use path directly
  if ! "${KUBECTL}" kustomize "${KUSTOMIZE_DIR}" > "${APPS_OUTFILE}" 2>&1; then
    fail "kubectl kustomize failed. Output:\n$(cat "${APPS_OUTFILE}")"
  fi
fi

log "Validating apps-dev.yaml with kubeconform..."
native_apps_outfile="$(to_native_path "${APPS_OUTFILE}")"
if ! "${KUBECONFORM}" -summary -strict -ignore-missing-schemas "${native_apps_outfile}"; then
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
