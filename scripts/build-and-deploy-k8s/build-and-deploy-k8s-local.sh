#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
log_dir="${repo_root}/build-logs/build-and-deploy-k8s"
year="$(date '+%Y')"
month="$(date '+%m')"
day="$(date '+%d')"
hour="$(date '+%H')"
minute="$(date '+%M')"
second="$(date '+%S')"
timestamp_readable="$(date '+%Y-%m-%d_%H-%M-%S')"
inverse_timestamp="$(printf '%04d%02d%02d-%02d%02d%02d' \
  "$((9999 - 10#${year}))" \
  "$((12 - 10#${month}))" \
  "$((31 - 10#${day}))" \
  "$((23 - 10#${hour}))" \
  "$((59 - 10#${minute}))" \
  "$((59 - 10#${second}))")"
script_name="$(basename "${BASH_SOURCE[0]%.*}")"
log_file="${log_dir}/inv${inverse_timestamp}__${timestamp_readable}__${script_name}.log"

mkdir -p "${log_dir}"

rotate_logs() {
  local files
  files="$(ls -1t "${log_dir}"/*.log 2>/dev/null | tail -n +4 2>/dev/null || true)"
  if [[ -n "${files}" ]]; then
    while IFS= read -r file; do
      [[ -n "${file}" ]] && rm -f -- "${file}" || true
    done <<< "${files}"
  fi
}
trap rotate_logs EXIT

exec > >(tee -a "${log_file}") 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

log "Build log file: ${log_file}"

run_make_target() {
  local target="$1"
  log "Running: make ${target}"
  make SHELL=bash "${target}"
}

get_kind_cluster_name() {
  local kind_config="${repo_root}/platform/k8s/infra/kind-config.yaml"
  if [[ ! -f "${kind_config}" ]]; then
    echo "cs301-crm"
    return
  fi

  local name
  name="$(awk -F': *' '/^[[:space:]]*name:[[:space:]]*/ {print $2; exit}' "${kind_config}" | xargs)"
  if [[ -z "${name}" ]]; then
    echo "cs301-crm"
  else
    echo "${name}"
  fi
}

get_k8s_deployments() {
  local kustomization="${repo_root}/platform/k8s/apps/base/kustomization.yaml"
  if [[ ! -f "${kustomization}" ]]; then
    return 0
  fi
  awk '
    $1 == "-" && $2 ~ /-deployment\.yaml$/ {
      gsub(/-deployment\.yaml$/, "", $2);
      deployments = deployments (deployments ? ", " : "") $2
    }
    END { if (deployments) print deployments }
  ' "${kustomization}"
}

kind_cluster_reachable() {
  local cluster_name="$1"
  local context_name="kind-${cluster_name}"
  kubectl --context "${context_name}" version --request-timeout=10s >/dev/null 2>&1
}

initialize_kind_cluster() {
  local cluster_name="$1"
  if ! (kind get clusters 2>/dev/null || true) | grep -Fxq "${cluster_name}"; then
    run_make_target kind-up
    return
  fi

  if kind_cluster_reachable "${cluster_name}"; then
    log "kind cluster '${cluster_name}' already exists and is reachable; skipping make kind-up."
    return
  fi

  log "kind cluster '${cluster_name}' exists but is unreachable; recreating."
  kind delete cluster --name "${cluster_name}" >/dev/null 2>&1 || true
  run_make_target kind-up
}

generate_k8s_deploy_summary_report() {
  local summary_script="${repo_root}/scripts/build-and-deploy-k8s/generate-k8s-deploy-summary.py"
  
  if [[ -z "${log_file}" ]]; then
    log "No log file set; skipping k8s deploy summary report generation."
    return
  fi
  
  if [[ ! -f "${summary_script}" ]]; then
    log "K8s deploy summary generator script not found: ${summary_script}"
    return
  fi
  
  # Check if Python is available and actually works
  local python_cmd=""
  for cmd in python3 python; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      # Test if Python actually works
      if "${cmd}" --version >/dev/null 2>&1; then
        python_cmd="${cmd}"
        break
      fi
    fi
  done
  
  if [[ -z "${python_cmd}" ]]; then
    log "Python not found or not working; skipping k8s deploy summary report generation."
    return
  fi
  
  log "Generating comprehensive K8s deployment summary report..."
  local script_output
  local exit_code
  
  # Capture output and exit code
  script_output=$("${python_cmd}" "${summary_script}" "${log_file}" "${log_dir}" 2>&1)
  exit_code=$?
  
  if [[ ${exit_code} -eq 0 ]]; then
    # Only show output if successful
    echo "${script_output}"
    log "K8s deployment summary report generated successfully."
    
    # Rotate old summary reports (keep most recent 3)
    local summary_files
    summary_files="$(ls -1t "${log_dir}"/summary-k8s-deploy__*.html 2>/dev/null | tail -n +4 2>/dev/null || true)"
    if [[ -n "${summary_files}" ]]; then
      while IFS= read -r file; do
        [[ -n "${file}" ]] && rm -f -- "${file}" 2>/dev/null || true
      done <<< "${summary_files}"
      log "Rotated old k8s deploy summary reports (kept 3 most recent)."
    fi
    
    # Also generate the legacy probe diagnostics summary for backward compatibility
    local probe_summary_script="${repo_root}/scripts/smoke-k8s-infra/generate-probe-summary.py"
    if [[ -f "${probe_summary_script}" ]]; then
      local probe_output
      probe_output=$("${python_cmd}" "${probe_summary_script}" "${log_file}" "${log_dir}" 2>&1)
      if [[ $? -eq 0 ]]; then
        log "Legacy probe diagnostics summary also generated."
        
        # Rotate old probe diagnostics reports (keep most recent 3)
        local probe_files
        probe_files="$(ls -1t "${log_dir}"/probe-diagnostics-summary*.html 2>/dev/null | tail -n +4 2>/dev/null || true)"
        if [[ -n "${probe_files}" ]]; then
          while IFS= read -r file; do
            [[ -n "${file}" ]] && rm -f -- "${file}" 2>/dev/null || true
          done <<< "${probe_files}"
        fi
      fi
    fi
  else
    log "Warning: Failed to generate k8s deploy summary report (exit code: ${exit_code})."
    if [[ -n "${script_output}" ]]; then
      log "Python script error output:"
      echo "${script_output}" | while IFS= read -r line; do
        log "  ${line}"
      done
    fi
  fi
}

if ! command -v make >/dev/null 2>&1; then
  log "Missing dependency: 'make' is not installed or not in PATH."
  exit 1
fi

if ! command -v bash >/dev/null 2>&1; then
  log "Missing dependency: 'bash' is not installed or not in PATH."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Missing dependency: 'docker' is not installed or not in PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  log "Docker is not available or the daemon is not running. Start Docker Desktop and retry."
  exit 1
fi

log "Running K8s manifest validation..."
if ! make -C "${repo_root}" SHELL=bash k8s-validate; then
  log "K8s validation failed. Aborting build-and-deploy."
  exit 1
fi
log "K8s validation passed."

kind_cluster_name="$(get_kind_cluster_name)"

cd "${repo_root}"
deployments="$(get_k8s_deployments || true)"
if [[ -n "${deployments}" ]]; then
  log "Base kustomization deployments: ${deployments}"
fi
initialize_kind_cluster "${kind_cluster_name}"

context_name="kind-${kind_cluster_name}"
if ! kubectl config use-context "${context_name}" >/dev/null 2>&1; then
  log "Failed to switch kubectl context to '${context_name}'."
  exit 1
fi

run_make_target infra-up
run_make_target build-images
run_make_target kind-load
run_make_target deploy-dev
run_make_target smoke

# Generate comprehensive k8s deploy summary report (before teardown)
generate_k8s_deploy_summary_report || log "Warning: Failed to generate k8s deploy summary report."

log "Smoke passed: tearing down local k8s resources and kind cluster '${kind_cluster_name}'"

# Best-effort cleanup. The kind cluster delete is the "complete teardown" step.
kubectl delete -k platform/k8s/apps/overlays/dev --ignore-not-found >/dev/null 2>&1 || true
helm uninstall postgres -n dev >/dev/null 2>&1 || true
helm uninstall ingress-nginx -n ingress-nginx >/dev/null 2>&1 || true
helm uninstall metrics-server -n kube-system >/dev/null 2>&1 || true

if ! kind delete cluster --name "${kind_cluster_name}" >/dev/null 2>&1; then
  log "Teardown failed: unable to delete kind cluster '${kind_cluster_name}'."
  exit 1
fi

log "Teardown complete: kind cluster '${kind_cluster_name}' deleted."

log "Local Kubernetes build/deploy and smoke checks completed successfully."
