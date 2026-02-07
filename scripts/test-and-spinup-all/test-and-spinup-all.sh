#!/usr/bin/env bash
set -euo pipefail

get_python_command() {
    for candidate in python python3 py; do
        if command -v "$candidate" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts_root="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${scripts_root}/.." && pwd)"
test_all_script="${scripts_root}/build-and-test-all/build-and-test-all.sh"
deploy_script="${scripts_root}/build-and-deploy-k8s/build-and-deploy-k8s-local.sh"
aggregated_coverage_generator="${scripts_root}/build-and-test-all/generate-aggregated-coverage-index.py"
report_output_dir="${repo_root}/build-logs/test-and-spinup-all"

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
log "  2. Generate aggregated coverage report"
log "  3. Deploy to local Kubernetes cluster"
log ""

log "Step 1: Running full test pipeline (backend + frontend)..."
bash "${test_all_script}" "$@"
log "Full test pipeline completed successfully."
log ""

# ========================
# Step 2: Generate Aggregated Coverage Report
# ========================
log "Step 2: Generating aggregated coverage report..."

PYTHON_COMMAND=""
if get_python_command >/dev/null 2>&1; then
    PYTHON_COMMAND=$(get_python_command)
fi

if [ -n "$PYTHON_COMMAND" ] && [ -f "$aggregated_coverage_generator" ]; then
    mkdir -p "$report_output_dir"
    log "Generating aggregated coverage report (build-logs/test-and-spinup-all/index.html)"
    export PYTHONDONTWRITEBYTECODE=1
    if "$PYTHON_COMMAND" "$aggregated_coverage_generator" --output-dir "$report_output_dir"; then
        log "Aggregated coverage report generated successfully"
    else
        log "Warning: Aggregated coverage index generation failed (exitCode=$?)."
    fi
else
    if [ -z "$PYTHON_COMMAND" ]; then
        log "Skipping aggregated coverage report generation: Python not available."
    elif [ ! -f "$aggregated_coverage_generator" ]; then
        log "Skipping aggregated coverage report generation: Generator script not found."
    fi
fi

log ""

# ========================
# Step 3: Deploy to local Kubernetes cluster
# ========================
log "Step 3: Running local k8s deployment..."
bash "${deploy_script}" "$@"
log "Local k8s deployment completed successfully."
log ""

log "========================================"
log "Test and Spin-Up All: Complete"
log "========================================"
log ""
log "All services tested and deployed successfully!"
log ""
log "Coverage Report:"
log "  - Aggregated:  ${report_output_dir}/index.html"
log ""
