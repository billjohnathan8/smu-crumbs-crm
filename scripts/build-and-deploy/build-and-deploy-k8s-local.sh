#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
log_dir="${repo_root}/build-logs/build-and-deploy"
year="$(date '+%Y')"
month="$(date '+%m')"
day="$(date '+%d')"
hour="$(date '+%H')"
minute="$(date '+%M')"
second="$(date '+%S')"
timestamp="${year}${month}${day}-${hour}${minute}${second}"
inverse_timestamp="$(printf '%04d%02d%02d-%02d%02d%02d' \
  "$((9999 - 10#${year}))" \
  "$((12 - 10#${month}))" \
  "$((31 - 10#${day}))" \
  "$((23 - 10#${hour}))" \
  "$((59 - 10#${minute}))" \
  "$((59 - 10#${second}))")"
script_name="$(basename "${BASH_SOURCE[0]%.*}")"
log_file="${log_dir}/${script_name}-${inverse_timestamp}-${timestamp}.log"

mkdir -p "${log_dir}"
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

kind_cluster_name="$(get_kind_cluster_name)"

cd "${repo_root}"
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
