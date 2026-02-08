#!/usr/bin/env bash
#
# CI/CD Local Validation Script (Bash version)
#
# Automates Phase 1 of the CI/CD testing plan:
# 1. Validates GitHub workflow syntax using actionlint
# 2. Runs the full local test pipeline (test-and-spinup-all.sh)
# 3. Generates a consolidated validation report
#
# Usage:
#   ./test-ci-cd-local.sh                  # Run full validation
#   SKIP_TESTS=1 ./test-ci-cd-local.sh     # Only actionlint
#   SKIP_ACTIONLINT=1 ./test-ci-cd-local.sh # Only tests
#   VERIFY_ONLY=1 ./test-ci-cd-local.sh    # Only check dependencies
#   KEEP_CLUSTER=1 ./test-ci-cd-local.sh   # Preserve kind cluster
#

set -euo pipefail

# ========================================================================================
# CONFIGURATION
# ========================================================================================

readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly LOG_DIR="${REPO_ROOT}/build-logs/${SCRIPT_NAME}"

# Environment variables (configuration)
readonly SKIP_TESTS="${SKIP_TESTS:-0}"
readonly SKIP_ACTIONLINT="${SKIP_ACTIONLINT:-0}"
readonly KEEP_CLUSTER="${KEEP_CLUSTER:-0}"
readonly VERIFY_ONLY="${VERIFY_ONLY:-0}"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_ACTIONLINT_FAILED=1
readonly EXIT_TESTS_FAILED=2
readonly EXIT_MISSING_DEPS=3

# ========================================================================================
# LOGGING SETUP
# ========================================================================================

mkdir -p "${LOG_DIR}"

# Create inverse-timestamp log file
now_year=$(date +%Y)
now_month=$(date +%m)
now_day=$(date +%d)
now_hour=$(date +%H)
now_minute=$(date +%M)
now_second=$(date +%S)

inv_year=$((9999 - now_year))
inv_month=$((12 - now_month))
inv_day=$((31 - now_day))
inv_hour=$((23 - now_hour))
inv_minute=$((59 - now_minute))
inv_second=$((59 - now_second))

timestamp_readable=$(date +%Y%m%d-%H%M%S)
log_file="${LOG_DIR}/inv$(printf '%04d%02d%02d-%02d%02d%02d' ${inv_year} ${inv_month} ${inv_day} ${inv_hour} ${inv_minute} ${inv_second})__${timestamp_readable}__${SCRIPT_NAME}.log"

# Log file handle
exec > >(tee -a "${log_file}")
exec 2>&1

# ========================================================================================
# UTILITY FUNCTIONS
# ========================================================================================

log() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

test_actionlint_available() {
    command_exists actionlint
}

test_docker_available() {
    if ! command_exists docker; then
        return 1
    fi

    docker info >/dev/null 2>&1
}

install_actionlint_portable() {
    log "actionlint not found. Attempting to install to .devtools/bin..."

    local devtools_bin="${REPO_ROOT}/.devtools/bin"
    mkdir -p "${devtools_bin}"

    local actionlint_bin="${devtools_bin}/actionlint"

    if [[ -f "${actionlint_bin}" ]]; then
        log "actionlint already exists at ${actionlint_bin}"
        export PATH="${devtools_bin}:${PATH}"
        return 0
    fi

    local os_type="$(uname -s)"
    local arch_type="$(uname -m)"

    local download_url
    case "${os_type}_${arch_type}" in
        Linux_x86_64)
            download_url="https://github.com/rhysd/actionlint/releases/latest/download/actionlint_1.7.5_linux_amd64.tar.gz"
            ;;
        Darwin_x86_64)
            download_url="https://github.com/rhysd/actionlint/releases/latest/download/actionlint_1.7.5_darwin_amd64.tar.gz"
            ;;
        Darwin_arm64)
            download_url="https://github.com/rhysd/actionlint/releases/latest/download/actionlint_1.7.5_darwin_arm64.tar.gz"
            ;;
        *)
            log "ERROR: Unsupported platform: ${os_type}_${arch_type}"
            return 1
            ;;
    esac

    log "Downloading actionlint from ${download_url}..."
    if ! curl -sSL "${download_url}" | tar -xz -C "${devtools_bin}" actionlint; then
        log "ERROR: Failed to download and extract actionlint"
        return 1
    fi

    if [[ -f "${actionlint_bin}" ]]; then
        chmod +x "${actionlint_bin}"
        log "actionlint installed successfully to ${actionlint_bin}"
        export PATH="${devtools_bin}:${PATH}"
        return 0
    else
        log "ERROR: actionlint extraction failed"
        return 1
    fi
}

run_actionlint_validation() {
    log "=================================================="
    log "PHASE 1.1: actionlint Workflow Validation"
    log "=================================================="

    if ! test_actionlint_available; then
        if ! install_actionlint_portable; then
            log "ERROR: actionlint is not available and could not be installed."
            log "Please install manually:"
            log "  brew install actionlint  # macOS"
            log "  OR download from https://github.com/rhysd/actionlint/releases"
            return 1
        fi
    fi

    local workflows_dir="${REPO_ROOT}/.github/workflows"

    if [[ ! -d "${workflows_dir}" ]]; then
        log "ERROR: Workflows directory not found: ${workflows_dir}"
        return 1
    fi

    log "Running actionlint on workflow files..."
    log "Directory: ${workflows_dir}"

    local workflow_files=()
    while IFS= read -r -d '' file; do
        workflow_files+=("$file")
    done < <(find "${workflows_dir}" -type f -name "*.yml" -print0)

    log "Found ${#workflow_files[@]} workflow files to validate"

    if actionlint "${workflow_files[@]}"; then
        log "✅ actionlint validation PASSED - no errors found"
        return 0
    else
        local exit_code=$?
        log "❌ actionlint validation FAILED - errors found (exit code: ${exit_code})"
        return 1
    fi
}

run_local_test_pipeline() {
    log "=================================================="
    log "PHASE 1.2: Local Test Pipeline"
    log "=================================================="

    local test_script="${REPO_ROOT}/scripts/test-and-spinup-all/test-and-spinup-all.sh"

    if [[ ! -f "${test_script}" ]]; then
        log "ERROR: test-and-spinup-all.sh not found at ${test_script}"
        return 1
    fi

    log "Running full local test pipeline..."
    log "Script: ${test_script}"

    if [[ "${KEEP_CLUSTER}" == "1" ]]; then
        log "Keep mode: kind cluster will be preserved after tests"
        export KEEP_CLUSTER=1
    fi

    if bash "${test_script}"; then
        log "✅ Local test pipeline PASSED"
        return 0
    else
        local exit_code=$?
        log "❌ Local test pipeline FAILED (exit code: ${exit_code})"
        return 1
    fi
}

test_dependencies() {
    log "=================================================="
    log "Dependency Check"
    log "=================================================="

    local all_deps_available=0

    # Required dependencies
    local deps=(
        "make:Build automation"
        "docker:Container runtime"
        "kubectl:Kubernetes CLI"
        "kind:Kubernetes in Docker"
    )

    if [[ "${SKIP_ACTIONLINT}" != "1" ]]; then
        deps+=("actionlint:Workflow validator")
    fi

    for dep_info in "${deps[@]}"; do
        local dep_name="${dep_info%%:*}"
        local dep_desc="${dep_info#*:}"

        if [[ "${dep_name}" == "docker" ]]; then
            if test_docker_available; then
                log "✅ ${dep_name} - ${dep_desc}"
            else
                log "❌ ${dep_name} - ${dep_desc} NOT FOUND or daemon not running"
                all_deps_available=1
            fi
        else
            if command_exists "${dep_name}"; then
                log "✅ ${dep_name} - ${dep_desc}"
            else
                log "❌ ${dep_name} - ${dep_desc} NOT FOUND"
                all_deps_available=1
            fi
        fi
    done

    # Optional dependencies
    local python_cmd=""
    for candidate in python python3 py; do
        if command_exists "${candidate}"; then
            python_cmd="${candidate}"
            break
        fi
    done

    if [[ -n "${python_cmd}" ]]; then
        log "✅ python - Report generation (optional)"
    else
        log "⚠️  python - Report generation (optional, not found)"
    fi

    log ""
    if [[ ${all_deps_available} -eq 0 ]]; then
        log "All required dependencies are available."
        return 0
    else
        log "Some required dependencies are missing. Please install them and retry."
        return 1
    fi
}

cleanup_old_logs() {
    # Keep only 3 most recent logs
    local log_files=($(ls -t "${LOG_DIR}"/*.log 2>/dev/null | tail -n +4))

    if [[ ${#log_files[@]} -gt 0 ]]; then
        rm -f "${log_files[@]}"
    fi
}

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

main() {
    log "=================================================="
    log "CI/CD Local Validation Script"
    log "=================================================="
    log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    log "Repository: ${REPO_ROOT}"
    log "Log file: ${log_file}"
    log ""

    # Dependency check
    if ! test_dependencies; then
        log ""
        log "❌ Dependency check failed. Exiting."
        cleanup_old_logs
        exit ${EXIT_MISSING_DEPS}
    fi

    if [[ "${VERIFY_ONLY}" == "1" ]]; then
        log ""
        log "Verify-only mode: Dependencies check complete. Exiting."
        cleanup_old_logs
        exit ${EXIT_SUCCESS}
    fi

    log ""

    # Phase 1.1: actionlint validation
    local actionlint_result=0
    if [[ "${SKIP_ACTIONLINT}" != "1" ]]; then
        if ! run_actionlint_validation; then
            log ""
            log "❌ actionlint validation failed. Fix workflow syntax errors and retry."
            log "See errors above for details."
            cleanup_old_logs
            exit ${EXIT_ACTIONLINT_FAILED}
        fi
    else
        log "=================================================="
        log "PHASE 1.1: actionlint Validation (SKIPPED)"
        log "=================================================="
    fi

    log ""

    # Phase 1.2: Local test pipeline
    local test_result=0
    if [[ "${SKIP_TESTS}" != "1" ]]; then
        if ! run_local_test_pipeline; then
            log ""
            log "❌ Local test pipeline failed."
            if [[ "${KEEP_CLUSTER}" == "1" ]]; then
                log "Kind cluster preserved for debugging."
                log "To cleanup: kind delete cluster --name cs301-crm"
            fi
            cleanup_old_logs
            exit ${EXIT_TESTS_FAILED}
        fi
    else
        log "=================================================="
        log "PHASE 1.2: Local Test Pipeline (SKIPPED)"
        log "=================================================="
    fi

    log ""
    log "=================================================="
    log "✅ LOCAL VALIDATION COMPLETED SUCCESSFULLY"
    log "=================================================="
    log ""
    log "Summary:"
    if [[ "${SKIP_ACTIONLINT}" == "1" ]]; then
        log "  - actionlint validation: SKIPPED"
    else
        log "  - actionlint validation: PASSED ✅"
    fi

    if [[ "${SKIP_TESTS}" == "1" ]]; then
        log "  - Local test pipeline:   SKIPPED"
    else
        log "  - Local test pipeline:   PASSED ✅"
    fi

    log ""
    log "Next steps:"
    log "  - Review test coverage reports: build-logs/test-and-spinup-all/index.html"
    log "  - Proceed to GitHub Actions testing: ./scripts/test-ci-cd-github/test-ci-cd-github.sh"
    log ""

    cleanup_old_logs
    exit ${EXIT_SUCCESS}
}

# Run main function
main "$@"
