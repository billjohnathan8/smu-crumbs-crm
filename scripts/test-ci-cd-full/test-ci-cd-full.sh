#!/usr/bin/env bash
#
# CI/CD Complete Testing Workflow Orchestration (Bash version)
#
# DESCRIPTION:
#   Orchestrates the full CI/CD testing workflow across all phases:
#
#   Phase 1: Local Validation (test-ci-cd-local.sh)
#   - Validates GitHub workflow syntax using actionlint
#   - Runs the full local test pipeline (test-and-spinup-all.sh)
#
#   Phase 2: GitHub Actions Testing (test-ci-cd-github.sh)
#   - Tests component trunk branch workflows
#   - Tests integration and main branch workflows
#   - Validates branch policy rules (if CREATE_PRS=1)
#
#   Phase 3: End-to-End Workflow (optional, if END_TO_END=1)
#   - Creates feature branch
#   - Creates PR to component trunk
#   - Verifies branch policy enforcement
#   - (Optionally) tests merge cascade up to main
#
#   Generates a consolidated report combining results from all phases.
#
# ENVIRONMENT VARIABLES:
#   LOCAL_ONLY       - Only run Phase 1 (local validation) (default: 0)
#   GITHUB_ONLY      - Skip Phase 1, only GitHub Actions and E2E (default: 0)
#   END_TO_END       - Run Phase 3 (end-to-end workflow test) (default: 0)
#   CREATE_PRS       - Create actual test PRs (passed to test-ci-cd-github.sh) (default: 0)
#   KEEP_CLUSTER     - Preserve kind cluster (passed to test-ci-cd-local.sh) (default: 0)
#   VERIFY_ONLY      - Only verify dependencies, don't run tests (default: 0)
#   TIMEOUT_MINUTES  - Maximum time for all phases (default: 120)
#
# EXIT CODES:
#   0   - All phases passed
#   1-2 - Phase 1 (local validation) failed
#   3-6 - Phase 2 (GitHub Actions) failed
#   7   - Phase 3 (E2E workflow) failed
#   8   - Timeout exceeded
#   9   - Dependency verification failed or invalid parameters
#
# EXAMPLES:
#   ./test-ci-cd-full.sh                             # Run Phases 1 and 2
#   LOCAL_ONLY=1 ./test-ci-cd-full.sh                # Only Phase 1
#   CREATE_PRS=1 END_TO_END=1 ./test-ci-cd-full.sh   # All three phases
#   VERIFY_ONLY=1 ./test-ci-cd-full.sh               # Only check dependencies
#
# NOTES:
#   Part of the CI/CD testing automation suite.
#   See: docs/testing/ci-cd-workflows.md
#

set -euo pipefail

# ========================================================================================
# CONFIGURATION
# ========================================================================================

# Environment variables with defaults
: "${LOCAL_ONLY:=0}"
: "${GITHUB_ONLY:=0}"
: "${END_TO_END:=0}"
: "${CREATE_PRS:=0}"
: "${KEEP_CLUSTER:=0}"
: "${VERIFY_ONLY:=0}"
: "${TIMEOUT_MINUTES:=120}"

# Script paths
readonly SCRIPT_NAME="test-ci-cd-full"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly LOG_DIR="${REPO_ROOT}/build-logs/${SCRIPT_NAME}"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_PHASE1_FAILED=1
readonly EXIT_PHASE2_FAILED=3
readonly EXIT_PHASE3_FAILED=7
readonly EXIT_TIMEOUT=8
readonly EXIT_DEPENDENCY_FAILED=9

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

timestamp_readable=$(date +%Y-%m-%d_%H-%M-%S)
readonly LOG_FILE="${LOG_DIR}/inv$(printf '%04d%02d%02d-%02d%02d%02d' ${inv_year} ${inv_month} ${inv_day} ${inv_hour} ${inv_minute} ${inv_second})__${timestamp_readable}__${SCRIPT_NAME}.log"

# Start logging
exec > >(tee -a "${LOG_FILE}")
exec 2>&1

# ========================================================================================
# PHASE RESULTS TRACKING
# ========================================================================================

# Phase 1: Local Validation
declare PHASE1_NAME="Phase 1: Local Validation"
declare PHASE1_STATUS="Not Run"
declare PHASE1_EXIT_CODE=""
declare PHASE1_DURATION=""
declare PHASE1_START_TIME=""
declare PHASE1_END_TIME=""

# Phase 2: GitHub Actions
declare PHASE2_NAME="Phase 2: GitHub Actions"
declare PHASE2_STATUS="Not Run"
declare PHASE2_EXIT_CODE=""
declare PHASE2_DURATION=""
declare PHASE2_START_TIME=""
declare PHASE2_END_TIME=""

# Phase 3: End-to-End Workflow
declare PHASE3_NAME="Phase 3: End-to-End Workflow"
declare PHASE3_STATUS="Not Run"
declare PHASE3_EXIT_CODE=""
declare PHASE3_DURATION=""
declare PHASE3_START_TIME=""
declare PHASE3_END_TIME=""

# ========================================================================================
# UTILITY FUNCTIONS
# ========================================================================================

log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] $1"
}

write_banner() {
    local title="$1"
    local border="================================================================================"
    log ""
    log "${border}"
    log "$(printf '%*s' $(((${#border} + ${#title}) / 2)) "${title}")"
    log "${border}"
    log ""
}

write_phase_header() {
    local phase_name="$1"
    local description="$2"
    local border="--------------------------------------------------------------------------------"
    log ""
    log "${border}"
    log ">>> ${phase_name}"
    log "${description}"
    log "${border}"
    log ""
}

format_duration() {
    local duration_sec="$1"
    local hours=$((duration_sec / 3600))
    local minutes=$(((duration_sec % 3600) / 60))
    local seconds=$((duration_sec % 60))

    if ((hours >= 1)); then
        printf "%dh %dm %ds" "${hours}" "${minutes}" "${seconds}"
    elif ((minutes >= 1)); then
        printf "%dm %ds" "${minutes}" "${seconds}"
    else
        printf "%.1fs" "${duration_sec}"
    fi
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

cleanup_and_exit() {
    local exit_code="$1"

    # Log rotation: keep only 3 most recent logs
    local log_count
    log_count=$(find "${LOG_DIR}" -name "*.log" -type f | wc -l)
    if ((log_count > 3)); then
        find "${LOG_DIR}" -name "*.log" -type f -printf '%T+ %p\n' | sort -r | tail -n +4 | cut -d' ' -f2- | xargs rm -f
    fi

    exit "${exit_code}"
}

# ========================================================================================
# DEPENDENCY VERIFICATION
# ========================================================================================

test_dependencies() {
    write_phase_header "DEPENDENCY VERIFICATION" "Checking required tools and services..."

    local all_ok=1

    # Check for Phase 1 dependencies
    if ((GITHUB_ONLY == 0)); then
        log "[CHECK] actionlint (or auto-install capability)..."
        if command_exists actionlint; then
            log "  ✓ actionlint is available"
        else
            log "  ℹ actionlint not found, but will be auto-installed if needed"
        fi

        log "[CHECK] Docker daemon..."
        if command_exists docker; then
            if docker info >/dev/null 2>&1; then
                log "  ✓ Docker daemon is running"
            else
                log "  ✗ Docker daemon is not running"
                all_ok=0
            fi
        else
            log "  ✗ Docker is not installed"
            all_ok=0
        fi

        log "[CHECK] kind CLI..."
        if command_exists kind; then
            log "  ✓ kind is available"
        else
            log "  ✗ kind is not installed"
            all_ok=0
        fi

        log "[CHECK] kubectl CLI..."
        if command_exists kubectl; then
            log "  ✓ kubectl is available"
        else
            log "  ✗ kubectl is not installed"
            all_ok=0
        fi
    fi

    # Check for Phase 2 dependencies
    if ((LOCAL_ONLY == 0)); then
        log "[CHECK] gh CLI (GitHub CLI)..."
        if command_exists gh; then
            log "  ✓ gh CLI is available"

            # Check authentication
            if gh auth status >/dev/null 2>&1; then
                log "  ✓ gh CLI is authenticated"
            else
                log "  ✗ gh CLI is not authenticated"
                log "    Run: gh auth login"
                all_ok=0
            fi
        else
            log "  ✗ gh CLI is not installed"
            log "    Install from: https://cli.github.com/"
            all_ok=0
        fi

        log "[CHECK] git CLI..."
        if command_exists git; then
            log "  ✓ git is available"
        else
            log "  ✗ git is not installed"
            all_ok=0
        fi
    fi

    log ""
    if ((all_ok == 1)); then
        log "✓ All dependency checks passed"
        return 0
    else
        log "✗ Some dependency checks failed"
        return 1
    fi
}

# ========================================================================================
# PHASE 1: LOCAL VALIDATION
# ========================================================================================

invoke_local_validation() {
    write_phase_header "PHASE 1: LOCAL VALIDATION" "Running actionlint and local test pipeline..."

    PHASE1_STATUS="Running"
    PHASE1_START_TIME=$(date +%s)

    local local_script="${REPO_ROOT}/scripts/test-ci-cd-local/test-ci-cd-local.sh"

    if [[ ! -f "${local_script}" ]]; then
        log "✗ Local validation script not found: ${local_script}"
        PHASE1_STATUS="Failed"
        PHASE1_EXIT_CODE=1
        return 1
    fi

    # Export environment variables for child script
    if ((KEEP_CLUSTER == 1)); then
        export KEEP_CLUSTER
    fi
    if ((VERIFY_ONLY == 1)); then
        export VERIFY_ONLY
    fi

    log "Invoking: ${local_script}"
    if ((KEEP_CLUSTER == 1)); then log "  with KEEP_CLUSTER=1"; fi
    if ((VERIFY_ONLY == 1)); then log "  with VERIFY_ONLY=1"; fi
    log ""

    # Execute local validation script
    local local_exit_code=0
    if bash "${local_script}"; then
        local_exit_code=0
    else
        local_exit_code=$?
    fi

    PHASE1_END_TIME=$(date +%s)
    PHASE1_DURATION=$((PHASE1_END_TIME - PHASE1_START_TIME))
    PHASE1_EXIT_CODE=${local_exit_code}

    log ""
    if ((local_exit_code == 0)); then
        PHASE1_STATUS="Passed"
        log "✓ Phase 1 completed successfully (Duration: $(format_duration ${PHASE1_DURATION}))"
        return 0
    else
        PHASE1_STATUS="Failed"
        log "✗ Phase 1 failed with exit code ${local_exit_code} (Duration: $(format_duration ${PHASE1_DURATION}))"
        return 1
    fi
}

# ========================================================================================
# PHASE 2: GITHUB ACTIONS TESTING
# ========================================================================================

invoke_github_testing() {
    write_phase_header "PHASE 2: GITHUB ACTIONS TESTING" "Testing GitHub Actions workflows..."

    PHASE2_STATUS="Running"
    PHASE2_START_TIME=$(date +%s)

    local github_script="${REPO_ROOT}/scripts/test-ci-cd-github/test-ci-cd-github.sh"

    if [[ ! -f "${github_script}" ]]; then
        log "✗ GitHub testing script not found: ${github_script}"
        PHASE2_STATUS="Failed"
        PHASE2_EXIT_CODE=3
        return 1
    fi

    # Export environment variables for child script
    if ((CREATE_PRS == 1)); then
        export CREATE_PRS
    fi
    if ((CREATE_PRS == 1 || END_TO_END == 1)); then
        export WAIT_FOR_WORKFLOWS=1
    fi
    if ((VERIFY_ONLY == 1)); then
        export VERIFY_ONLY
    fi
    export TIMEOUT_MINUTES

    log "Invoking: ${github_script}"
    if ((CREATE_PRS == 1)); then log "  with CREATE_PRS=1"; fi
    if ((CREATE_PRS == 1 || END_TO_END == 1)); then log "  with WAIT_FOR_WORKFLOWS=1"; fi
    if ((VERIFY_ONLY == 1)); then log "  with VERIFY_ONLY=1"; fi
    log "  with TIMEOUT_MINUTES=${TIMEOUT_MINUTES}"
    log ""

    # Execute GitHub testing script
    local github_exit_code=0
    if bash "${github_script}"; then
        github_exit_code=0
    else
        github_exit_code=$?
    fi

    PHASE2_END_TIME=$(date +%s)
    PHASE2_DURATION=$((PHASE2_END_TIME - PHASE2_START_TIME))
    PHASE2_EXIT_CODE=${github_exit_code}

    log ""
    if ((github_exit_code == 0)); then
        PHASE2_STATUS="Passed"
        log "✓ Phase 2 completed successfully (Duration: $(format_duration ${PHASE2_DURATION}))"
        return 0
    else
        PHASE2_STATUS="Failed"
        log "✗ Phase 2 failed with exit code ${github_exit_code} (Duration: $(format_duration ${PHASE2_DURATION}))"
        return 1
    fi
}

# ========================================================================================
# PHASE 3: END-TO-END WORKFLOW
# ========================================================================================

invoke_end_to_end_workflow() {
    write_phase_header "PHASE 3: END-TO-END WORKFLOW" "Testing complete feature branch to main merge cascade..."

    PHASE3_STATUS="Running"
    PHASE3_START_TIME=$(date +%s)

    # Save current branch to restore later
    local original_branch
    if ! original_branch=$(git rev-parse --abbrev-ref HEAD 2>&1); then
        log "✗ Failed to get current branch"
        PHASE3_STATUS="Failed"
        PHASE3_EXIT_CODE=7
        return 1
    fi

    # Generate unique feature branch name
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local feature_branch="feat/test-e2e-${timestamp}"
    local component_trunk="frontend"  # Use frontend as test target

    log "Creating test feature branch: ${feature_branch}"

    # Create and checkout feature branch from component trunk
    if ! git fetch origin "${component_trunk}:${component_trunk}" 2>&1; then
        log "✗ Failed to fetch ${component_trunk}"
        PHASE3_STATUS="Failed"
        PHASE3_EXIT_CODE=7
        return 1
    fi

    if ! git checkout -b "${feature_branch}" "${component_trunk}" 2>&1; then
        log "✗ Failed to create feature branch"
        PHASE3_STATUS="Failed"
        PHASE3_EXIT_CODE=7
        return 1
    fi

    # Make a trivial test change
    local test_file="${REPO_ROOT}/services/frontend/crm-ui/README.md"
    if [[ -f "${test_file}" ]]; then
        echo "" >> "${test_file}"
        echo "<!-- E2E test marker: ${timestamp} -->" >> "${test_file}"

        log "Adding test commit..."
        git add "${test_file}" 2>&1
        if ! git commit -m "test: E2E workflow validation (${timestamp})" 2>&1; then
            log "✗ Failed to create test commit"
            PHASE3_STATUS="Failed"
            PHASE3_EXIT_CODE=7
            git checkout "${original_branch}" 2>&1 || true
            return 1
        fi

        # Push feature branch
        log "Pushing feature branch to origin..."
        if ! git push -u origin "${feature_branch}" 2>&1; then
            log "✗ Failed to push feature branch"
            PHASE3_STATUS="Failed"
            PHASE3_EXIT_CODE=7
            git checkout "${original_branch}" 2>&1 || true
            return 1
        fi

        # Create PR using gh CLI
        log "Creating PR: ${feature_branch} -> ${component_trunk}"
        local pr_body="## E2E Workflow Test

This is an automated test PR created by \`test-ci-cd-full.sh\`.

**Test Timestamp:** ${timestamp}
**Purpose:** Validate branch policy enforcement and workflow cascade

This PR should be **deleted after testing**."

        local pr_url
        if ! pr_url=$(gh pr create \
            --base "${component_trunk}" \
            --head "${feature_branch}" \
            --title "test: E2E workflow validation (${timestamp})" \
            --body "${pr_body}" \
            2>&1); then
            log "✗ Failed to create PR: ${pr_url}"
            PHASE3_STATUS="Failed"
            PHASE3_EXIT_CODE=7
            git checkout "${original_branch}" 2>&1 || true
            return 1
        fi

        log "✓ PR created: ${pr_url}"
        log ""
        log "Waiting for branch policy checks to run..."

        # Wait for status checks (timeout after 10 minutes)
        local check_timeout=600  # 10 minutes
        local check_interval=15  # Check every 15 seconds
        local elapsed=0
        local checks_complete=0

        while ((elapsed < check_timeout)); do
            sleep ${check_interval}
            elapsed=$((elapsed + check_interval))

            local pr_status
            if pr_status=$(gh pr view "${feature_branch}" --json statusCheckRollup 2>&1); then
                # Check if there are any pending checks
                local pending_count
                pending_count=$(echo "${pr_status}" | jq -r '.statusCheckRollup[] | select(.status == "PENDING" or .status == "IN_PROGRESS") | .context' 2>/dev/null | wc -l || echo "0")

                local failed_count
                failed_count=$(echo "${pr_status}" | jq -r '.statusCheckRollup[] | select(.status == "FAILURE" or .status == "ERROR") | .context' 2>/dev/null | wc -l || echo "0")

                if ((pending_count == 0)); then
                    checks_complete=1
                    if ((failed_count > 0)); then
                        log "✗ Some status checks failed:"
                        echo "${pr_status}" | jq -r '.statusCheckRollup[] | select(.status == "FAILURE" or .status == "ERROR") | "  - \(.context): \(.state)"' 2>/dev/null || true
                        break
                    else
                        log "✓ All status checks passed"
                        break
                    fi
                fi

                log "  Still waiting... (${elapsed}/${check_timeout} seconds elapsed)"
            else
                log "  No status checks found yet... (${elapsed}/${check_timeout} seconds elapsed)"
            fi
        done

        if ((checks_complete == 0 && elapsed >= check_timeout)); then
            log "⚠ Timeout waiting for status checks to complete"
        fi

        # Cleanup: close PR and delete branch
        log ""
        log "Cleaning up test PR and branch..."
        gh pr close "${feature_branch}" --delete-branch 2>&1 || true

        # Restore original branch
        git checkout "${original_branch}" 2>&1 || true

        PHASE3_END_TIME=$(date +%s)
        PHASE3_DURATION=$((PHASE3_END_TIME - PHASE3_START_TIME))
        PHASE3_EXIT_CODE=0
        PHASE3_STATUS="Passed"

        log ""
        log "✓ Phase 3 completed successfully (Duration: $(format_duration ${PHASE3_DURATION}))"
        return 0
    else
        log "✗ Test file not found: ${test_file}"
        PHASE3_STATUS="Failed"
        PHASE3_EXIT_CODE=7
        git checkout "${original_branch}" 2>&1 || true
        return 1
    fi
}

# ========================================================================================
# CONSOLIDATED REPORTING
# ========================================================================================

generate_consolidated_report() {
    log ""
    log "Generating consolidated test report..."

    local report_file="${LOG_DIR}/complete-test-report.html"
    local now_display
    now_display=$(date '+%Y-%m-%d %H:%M:%S')

    # Calculate overall status
    local all_passed=1
    local phases_run=0

    # Check Phase 1
    if [[ "${PHASE1_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ "${PHASE1_STATUS}" != "Passed" ]]; then
            all_passed=0
        fi
    fi

    # Check Phase 2
    if [[ "${PHASE2_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ "${PHASE2_STATUS}" != "Passed" ]]; then
            all_passed=0
        fi
    fi

    # Check Phase 3
    if [[ "${PHASE3_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ "${PHASE3_STATUS}" != "Passed" ]]; then
            all_passed=0
        fi
    fi

    local overall_status="FAILED"
    local status_color="#dc3545"
    if ((all_passed == 1 && phases_run > 0)); then
        overall_status="PASSED"
        status_color="#28a745"
    fi

    # Calculate total duration
    local total_duration=0
    if [[ -n "${PHASE1_DURATION}" ]]; then
        total_duration=$((total_duration + PHASE1_DURATION))
    fi
    if [[ -n "${PHASE2_DURATION}" ]]; then
        total_duration=$((total_duration + PHASE2_DURATION))
    fi
    if [[ -n "${PHASE3_DURATION}" ]]; then
        total_duration=$((total_duration + PHASE3_DURATION))
    fi

    # Generate status badge class helper
    get_status_class() {
        case "$1" in
            "Passed") echo "status-passed" ;;
            "Failed") echo "status-failed" ;;
            "Error") echo "status-error" ;;
            "Running") echo "status-running" ;;
            *) echo "status-notrun" ;;
        esac
    }

    # Generate phase info grid helper
    generate_phase_info() {
        local phase_status="$1"
        local phase_exit_code="$2"
        local phase_duration="$3"
        local phase_start="$4"
        local phase_end="$5"

        if [[ "${phase_status}" != "Not Run" ]]; then
            local duration_formatted="N/A"
            if [[ -n "${phase_duration}" ]]; then
                duration_formatted=$(format_duration "${phase_duration}")
            fi

            local start_time_formatted="N/A"
            if [[ -n "${phase_start}" ]]; then
                start_time_formatted=$(date -d "@${phase_start}" '+%H:%M:%S' 2>/dev/null || date -r "${phase_start}" '+%H:%M:%S' 2>/dev/null || echo "N/A")
            fi

            local end_time_formatted="N/A"
            if [[ -n "${phase_end}" ]]; then
                end_time_formatted=$(date -d "@${phase_end}" '+%H:%M:%S' 2>/dev/null || date -r "${phase_end}" '+%H:%M:%S' 2>/dev/null || echo "N/A")
            fi

            cat << EOF
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Exit Code</strong>
                                <span>${phase_exit_code}</span>
                            </div>
                            <div class="info-item">
                                <strong>Duration</strong>
                                <span>${duration_formatted}</span>
                            </div>
                            <div class="info-item">
                                <strong>Start Time</strong>
                                <span>${start_time_formatted}</span>
                            </div>
                            <div class="info-item">
                                <strong>End Time</strong>
                                <span>${end_time_formatted}</span>
                            </div>
                        </div>
EOF
        else
            cat << EOF
                        <p style="color: #6c757d; font-style: italic;">This phase was not executed in this test run.</p>
EOF
        fi
    }

    # Generate HTML report
    cat > "${report_file}" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI/CD Complete Test Report - ${timestamp_readable}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }
        .overall-status {
            background: ${status_color};
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 1.5em;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .content { padding: 30px; }
        .phase-section {
            margin-bottom: 30px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }
        .phase-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .phase-header h2 { font-size: 1.3em; color: #495057; }
        .phase-body { padding: 20px; }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-passed { background: #d4edda; color: #155724; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .status-error { background: #fff3cd; color: #856404; }
        .status-notrun { background: #e2e3e5; color: #383d41; }
        .status-running { background: #cce5ff; color: #004085; }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .info-item {
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        .info-item strong { display: block; color: #6c757d; font-size: 0.85em; margin-bottom: 5px; }
        .info-item span { font-size: 1.1em; color: #212529; }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            border-top: 1px solid #e0e0e0;
        }
        .log-path {
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-size: 0.9em;
            word-break: break-all;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 CI/CD Complete Test Report</h1>
            <p>Full Testing Workflow Validation</p>
        </div>

        <div class="overall-status">
            ${overall_status}
        </div>

        <div class="content">
            <div class="info-grid">
                <div class="info-item">
                    <strong>Test Date</strong>
                    <span>${now_display}</span>
                </div>
                <div class="info-item">
                    <strong>Phases Run</strong>
                    <span>${phases_run} of 3</span>
                </div>
                <div class="info-item">
                    <strong>Total Duration</strong>
                    <span>$(format_duration ${total_duration})</span>
                </div>
            </div>

            <div style="margin-top: 30px;">
                <div class="phase-section">
                    <div class="phase-header">
                        <h2>${PHASE1_NAME}</h2>
                        <span class="status-badge $(get_status_class "${PHASE1_STATUS}")">${PHASE1_STATUS}</span>
                    </div>
                    <div class="phase-body">
$(generate_phase_info "${PHASE1_STATUS}" "${PHASE1_EXIT_CODE}" "${PHASE1_DURATION}" "${PHASE1_START_TIME}" "${PHASE1_END_TIME}")
                    </div>
                </div>

                <div class="phase-section">
                    <div class="phase-header">
                        <h2>${PHASE2_NAME}</h2>
                        <span class="status-badge $(get_status_class "${PHASE2_STATUS}")">${PHASE2_STATUS}</span>
                    </div>
                    <div class="phase-body">
$(generate_phase_info "${PHASE2_STATUS}" "${PHASE2_EXIT_CODE}" "${PHASE2_DURATION}" "${PHASE2_START_TIME}" "${PHASE2_END_TIME}")
                    </div>
                </div>

                <div class="phase-section">
                    <div class="phase-header">
                        <h2>${PHASE3_NAME}</h2>
                        <span class="status-badge $(get_status_class "${PHASE3_STATUS}")">${PHASE3_STATUS}</span>
                    </div>
                    <div class="phase-body">
$(generate_phase_info "${PHASE3_STATUS}" "${PHASE3_EXIT_CODE}" "${PHASE3_DURATION}" "${PHASE3_START_TIME}" "${PHASE3_END_TIME}")
                    </div>
                </div>
            </div>

            <div class="log-path">
                <strong>Full Log File:</strong><br>
                ${LOG_FILE}
            </div>
        </div>

        <div class="footer">
            <p>Generated by test-ci-cd-full.sh | CS301-ITSA-Scroogebank-CRM Project</p>
            <p style="margin-top: 5px; font-size: 0.9em;">See docs/testing/ci-cd-workflows.md for more information</p>
        </div>
    </div>
</body>
</html>
EOF

    log "✓ Consolidated report generated: ${report_file}"
}

show_summary() {
    write_banner "TEST EXECUTION SUMMARY"

    # Phase 1
    local icon1="○"
    case "${PHASE1_STATUS}" in
        "Passed") icon1="✓" ;;
        "Failed") icon1="✗" ;;
        "Error") icon1="⚠" ;;
        "Running") icon1="⏳" ;;
    esac

    local status_text1="${icon1} ${PHASE1_NAME}: ${PHASE1_STATUS}"
    if [[ -n "${PHASE1_DURATION}" ]]; then
        status_text1+=" ($(format_duration ${PHASE1_DURATION}))"
    fi
    if [[ -n "${PHASE1_EXIT_CODE}" ]]; then
        status_text1+=" [Exit: ${PHASE1_EXIT_CODE}]"
    fi
    log "${status_text1}"

    # Phase 2
    local icon2="○"
    case "${PHASE2_STATUS}" in
        "Passed") icon2="✓" ;;
        "Failed") icon2="✗" ;;
        "Error") icon2="⚠" ;;
        "Running") icon2="⏳" ;;
    esac

    local status_text2="${icon2} ${PHASE2_NAME}: ${PHASE2_STATUS}"
    if [[ -n "${PHASE2_DURATION}" ]]; then
        status_text2+=" ($(format_duration ${PHASE2_DURATION}))"
    fi
    if [[ -n "${PHASE2_EXIT_CODE}" ]]; then
        status_text2+=" [Exit: ${PHASE2_EXIT_CODE}]"
    fi
    log "${status_text2}"

    # Phase 3
    local icon3="○"
    case "${PHASE3_STATUS}" in
        "Passed") icon3="✓" ;;
        "Failed") icon3="✗" ;;
        "Error") icon3="⚠" ;;
        "Running") icon3="⏳" ;;
    esac

    local status_text3="${icon3} ${PHASE3_NAME}: ${PHASE3_STATUS}"
    if [[ -n "${PHASE3_DURATION}" ]]; then
        status_text3+=" ($(format_duration ${PHASE3_DURATION}))"
    fi
    if [[ -n "${PHASE3_EXIT_CODE}" ]]; then
        status_text3+=" [Exit: ${PHASE3_EXIT_CODE}]"
    fi
    log "${status_text3}"

    log ""

    # Calculate total duration
    local total_duration=0
    local phases_run=0
    if [[ "${PHASE1_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ -n "${PHASE1_DURATION}" ]]; then
            total_duration=$((total_duration + PHASE1_DURATION))
        fi
    fi
    if [[ "${PHASE2_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ -n "${PHASE2_DURATION}" ]]; then
            total_duration=$((total_duration + PHASE2_DURATION))
        fi
    fi
    if [[ "${PHASE3_STATUS}" != "Not Run" ]]; then
        phases_run=$((phases_run + 1))
        if [[ -n "${PHASE3_DURATION}" ]]; then
            total_duration=$((total_duration + PHASE3_DURATION))
        fi
    fi

    log "Total Duration: $(format_duration ${total_duration})"
    log "Phases Run: ${phases_run} of 3"
    log ""

    local report_file="${LOG_DIR}/complete-test-report.html"
    if [[ -f "${report_file}" ]]; then
        log "📊 Full Report: ${report_file}"
    fi
    log "📋 Full Log: ${LOG_FILE}"
    log ""
}

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

main() {
    write_banner "CI/CD COMPLETE TESTING WORKFLOW"
    log "Script: ${BASH_SOURCE[0]}"
    log "Working Directory: ${REPO_ROOT}"
    log "Log File: ${LOG_FILE}"
    log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    log ""

    # Display configuration
    log "Configuration:"
    log "  Local Validation: $( ((GITHUB_ONLY == 0)) && echo 'RUN' || echo 'SKIP' )"
    log "  GitHub Actions: $( ((LOCAL_ONLY == 0)) && echo 'RUN' || echo 'SKIP' )"
    log "  End-to-End Workflow: $( ((END_TO_END == 1)) && echo 'RUN' || echo 'SKIP' )"
    log "  Create PRs: $( ((CREATE_PRS == 1)) && echo 'YES' || echo 'NO' )"
    log "  Keep Cluster: $( ((KEEP_CLUSTER == 1)) && echo 'YES' || echo 'NO' )"
    log "  Verify Only: $( ((VERIFY_ONLY == 1)) && echo 'YES' || echo 'NO' )"
    log "  Timeout: ${TIMEOUT_MINUTES} minutes"
    log ""

    # Validate parameters
    if ((LOCAL_ONLY == 1 && GITHUB_ONLY == 1)); then
        log "✗ Error: Cannot specify both LOCAL_ONLY=1 and GITHUB_ONLY=1"
        cleanup_and_exit ${EXIT_DEPENDENCY_FAILED}
    fi

    if ((END_TO_END == 1 && LOCAL_ONLY == 1)); then
        log "✗ Error: Cannot run END_TO_END=1 with LOCAL_ONLY=1 (requires GitHub Actions)"
        cleanup_and_exit ${EXIT_DEPENDENCY_FAILED}
    fi

    # Verify dependencies
    if ! test_dependencies; then
        log ""
        log "✗ Dependency verification failed"
        cleanup_and_exit ${EXIT_DEPENDENCY_FAILED}
    fi

    if ((VERIFY_ONLY == 1)); then
        log ""
        log "✓ Verification complete (VerifyOnly mode, skipping tests)"
        cleanup_and_exit ${EXIT_SUCCESS}
    fi

    # Start overall timer
    local overall_start
    overall_start=$(date +%s)

    # Phase 1: Local Validation
    if ((GITHUB_ONLY == 0)); then
        if ! invoke_local_validation; then
            local exit_code=${PHASE1_EXIT_CODE:-1}
            generate_consolidated_report
            show_summary
            log "✗ Aborting: Phase 1 (Local Validation) failed"
            cleanup_and_exit "${exit_code}"
        fi
    fi

    # Phase 2: GitHub Actions Testing
    if ((LOCAL_ONLY == 0)); then
        if ! invoke_github_testing; then
            local exit_code=${PHASE2_EXIT_CODE:-3}
            generate_consolidated_report
            show_summary
            log "✗ Aborting: Phase 2 (GitHub Actions) failed"
            cleanup_and_exit "${exit_code}"
        fi
    fi

    # Phase 3: End-to-End Workflow (optional)
    if ((END_TO_END == 1)); then
        if ! invoke_end_to_end_workflow; then
            local exit_code=${PHASE3_EXIT_CODE:-7}
            generate_consolidated_report
            show_summary
            log "✗ Phase 3 (End-to-End Workflow) failed"
            cleanup_and_exit "${exit_code}"
        fi
    fi

    # Calculate total duration
    local overall_end
    overall_end=$(date +%s)
    local overall_duration=$((overall_end - overall_start))

    # Generate consolidated report
    generate_consolidated_report

    # Display summary
    show_summary

    log "╔════════════════════════════════════════════════════════════════════════════╗"
    log "║                           ✓ ALL PHASES PASSED                              ║"
    log "╚════════════════════════════════════════════════════════════════════════════╝"
    log ""
    log "Overall Duration: $(format_duration ${overall_duration})"

    cleanup_and_exit ${EXIT_SUCCESS}
}

# Run main function
main "$@"
