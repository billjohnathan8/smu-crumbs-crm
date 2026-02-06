#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts_root="$(cd "${script_dir}/.." && pwd)"
test_all_script="${scripts_root}/build-and-test-all/build-and-test-all.sh"
deploy_script="${scripts_root}/build-and-deploy-k8s/build-and-deploy-k8s-local.sh"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

if [[ ! -f "${test_all_script}" ]]; then
  log "Full test script not found: ${test_all_script}"
  exit 1
fi

if [[ ! -f "${deploy_script}" ]]; then
  log "Deploy script not found: ${deploy_script}"
  exit 1
fi

log "========================================"
log "Test and Spin-Up All Services"
log "========================================"
log ""
log "This will:"
log "  1. Run full test pipeline (backend + frontend)"
log "  2. Deploy to local Kubernetes cluster"
log ""

log "Step 1: Running full test pipeline (backend + frontend)..."
bash "${test_all_script}" "$@"
log "Full test pipeline completed successfully."
log ""

log "Step 2: Running local k8s deployment..."
bash "${deploy_script}" "$@"
log "Local k8s deployment completed successfully."
log ""

log "========================================"
log "Test and Spin-Up All: Complete"
log "========================================"
log ""
log "All services tested and deployed successfully!"
