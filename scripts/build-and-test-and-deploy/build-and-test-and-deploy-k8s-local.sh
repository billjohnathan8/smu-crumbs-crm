#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts_root="$(cd "${script_dir}/.." && pwd)"
test_script="${scripts_root}/build-and-test/build-and-test-backend.sh"
deploy_script="${scripts_root}/build-and-deploy/build-and-deploy-k8s-local.sh"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

if [[ ! -f "${test_script}" ]]; then
  log "Test script not found: ${test_script}"
  exit 1
fi

if [[ ! -f "${deploy_script}" ]]; then
  log "Deploy script not found: ${deploy_script}"
  exit 1
fi

log "Running backend test pipeline."
bash "${test_script}" "$@"

log "Running local k8s deploy."
bash "${deploy_script}" "$@"

log "Done."
