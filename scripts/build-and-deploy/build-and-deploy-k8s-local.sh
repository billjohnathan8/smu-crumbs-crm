#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

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
  if ! kind get clusters 2>/dev/null | grep -Fxq "${cluster_name}"; then
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

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
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

log "Local Kubernetes build/deploy and smoke checks completed successfully."
