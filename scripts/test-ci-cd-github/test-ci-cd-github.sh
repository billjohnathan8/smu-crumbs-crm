#!/usr/bin/env bash
#
# GitHub Actions Workflow Testing Script (Bash version)
#
# DESCRIPTION:
#   This script automates Phase 2 of the CI/CD testing plan:
#   1. Verifies gh CLI is installed and authenticated
#   2. Creates test commits on component trunk branches
#   3. Pushes commits to trigger GitHub Actions workflows
#   4. Monitors workflow runs and collects results
#   5. Optionally creates test PRs to validate branch policy rules
#   6. Generates a JSON report of workflow results
#
# SAFETY: Runs in dry-run mode by default. Set CREATE_PRS=1 to actually create PRs.
#
# ENVIRONMENT VARIABLES:
#   BRANCHES           - Space-separated list of branches (default: all 6 components)
#   SKIP_COMPONENT_TRUNKS - Skip testing component trunk branches (default: 0)
#   SKIP_INTEGRATION   - Skip testing integration branch (default: 0)
#   SKIP_MAIN          - Skip testing main branch (default: 0)
#   SKIP_BRANCH_POLICY - Skip branch policy validation (default: 0)
#   CREATE_PRS         - Actually create test PRs (default: 0 = dry-run)
#   WAIT_FOR_WORKFLOWS - Wait for workflow completion (default: 0)
#   VERIFY_ONLY        - Only verify dependencies (default: 0)
#   TIMEOUT_MINUTES    - Workflow timeout (default: 60)
#
# EXIT CODES:
#   0 - Success
#   1 - Workflows failed
#   2 - Policy violations
#   3 - gh CLI not available
#   4 - Timeout
#
# EXAMPLES:
#   VERIFY_ONLY=1 ./test-ci-cd-github.sh
#   WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
#   CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
#

set -euo pipefail

# ========================================================================================
# CONFIGURATION
# ========================================================================================

# Default configuration
: "${BRANCHES:=frontend agent-backend log-backend client-backend transaction-backend infrastructure}"
: "${SKIP_COMPONENT_TRUNKS:=0}"
: "${SKIP_INTEGRATION:=0}"
: "${SKIP_MAIN:=0}"
: "${SKIP_BRANCH_POLICY:=0}"
: "${CREATE_PRS:=0}"
: "${WAIT_FOR_WORKFLOWS:=0}"
: "${VERIFY_ONLY:=0}"
: "${TIMEOUT_MINUTES:=60}"

# Script paths
SCRIPT_NAME="test-ci-cd-github"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${REPO_ROOT}/build-logs/${SCRIPT_NAME}"

# Repository info
REPOSITORY="cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3"

# Results tracking
declare -A WORKFLOW_RESULTS_BRANCHES
declare -A WORKFLOW_RESULTS_PRS
TOTAL_WORKFLOWS=0
PASSED_WORKFLOWS=0
FAILED_WORKFLOWS=0
TIMED_OUT_WORKFLOWS=0
TOTAL_PRS=0
PASSED_PRS=0
FAILED_PRS=0

# Test commits tracking
declare -a TEST_COMMITS_BRANCH
declare -a TEST_COMMITS_SHA

# ========================================================================================
# UTILITY FUNCTIONS
# ========================================================================================

log() {
    local message="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_message="[${timestamp}] ${message}"

    # Print to console
    echo "${log_message}"

    # Append to log file (strip ANSI codes)
    if [[ -n "${LOG_FILE:-}" ]]; then
        echo "${log_message}" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' >> "${LOG_FILE}"
    fi
}

exit_with_code() {
    local exit_code="$1"

    # Save workflow results to JSON
    save_workflow_results

    # Log rotation: keep only 3 most recent logs
    cleanup_old_logs

    exit "${exit_code}"
}

cleanup_old_logs() {
    local log_files
    mapfile -t log_files < <(ls -t "${LOG_DIR}"/*.log 2>/dev/null || true)

    if [[ ${#log_files[@]} -gt 3 ]]; then
        local files_to_delete=("${log_files[@]:3}")
        if [[ ${#files_to_delete[@]} -gt 0 ]]; then
            rm -f "${files_to_delete[@]}"
        fi
    fi
}

save_workflow_results() {
    local results_file="${LOG_DIR}/workflow-results.json"

    log "Saving workflow results to: ${results_file}"

    # Build JSON manually (or use jq if available)
    if command -v jq &> /dev/null; then
        save_workflow_results_jq "${results_file}"
    else
        save_workflow_results_manual "${results_file}"
    fi
}

save_workflow_results_jq() {
    local results_file="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Convert bash associative arrays to JSON using jq
    local branches_json="{}"
    for branch in "${!WORKFLOW_RESULTS_BRANCHES[@]}"; do
        branches_json=$(echo "${branches_json}" | jq --arg key "$branch" --arg val "${WORKFLOW_RESULTS_BRANCHES[$branch]}" \
            '.[$key] = ($val | fromjson)')
    done

    local prs_json="{}"
    for branch in "${!WORKFLOW_RESULTS_PRS[@]}"; do
        prs_json=$(echo "${prs_json}" | jq --arg key "$branch" --arg val "${WORKFLOW_RESULTS_PRS[$branch]}" \
            '.[$key] = ($val | fromjson)')
    done

    jq -n \
        --arg timestamp "$timestamp" \
        --arg repository "$REPOSITORY" \
        --argjson branches "$branches_json" \
        --argjson prs "$prs_json" \
        --argjson total_workflows "$TOTAL_WORKFLOWS" \
        --argjson passed_workflows "$PASSED_WORKFLOWS" \
        --argjson failed_workflows "$FAILED_WORKFLOWS" \
        --argjson timed_out_workflows "$TIMED_OUT_WORKFLOWS" \
        --argjson total_prs "$TOTAL_PRS" \
        --argjson passed_prs "$PASSED_PRS" \
        --argjson failed_prs "$FAILED_PRS" \
        '{
            timestamp: $timestamp,
            repository: $repository,
            branches: $branches,
            prs: $prs,
            summary: {
                totalWorkflows: $total_workflows,
                passedWorkflows: $passed_workflows,
                failedWorkflows: $failed_workflows,
                timedOutWorkflows: $timed_out_workflows,
                totalPRs: $total_prs,
                passedPRs: $passed_prs,
                failedPRs: $failed_prs
            }
        }' > "${results_file}"
}

save_workflow_results_manual() {
    local results_file="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Manual JSON construction
    cat > "${results_file}" <<EOF
{
  "timestamp": "${timestamp}",
  "repository": "${REPOSITORY}",
  "branches": {},
  "prs": {},
  "summary": {
    "totalWorkflows": ${TOTAL_WORKFLOWS},
    "passedWorkflows": ${PASSED_WORKFLOWS},
    "failedWorkflows": ${FAILED_WORKFLOWS},
    "timedOutWorkflows": ${TIMED_OUT_WORKFLOWS},
    "totalPRs": ${TOTAL_PRS},
    "passedPRs": ${PASSED_PRS},
    "failedPRs": ${FAILED_PRS}
  }
}
EOF
}

test_command_available() {
    command -v "$1" &> /dev/null
}

test_gh_cli_available() {
    test_command_available gh
}

test_gh_cli_authenticated() {
    if ! test_gh_cli_available; then
        return 1
    fi

    if gh auth status &> /dev/null; then
        log "gh CLI authentication verified"
        return 0
    else
        log "gh CLI not authenticated"
        return 1
    fi
}

get_current_branch() {
    git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
}

get_current_commit_sha() {
    git rev-parse HEAD 2>/dev/null || echo ""
}

# ========================================================================================
# GIT OPERATIONS
# ========================================================================================

create_test_commit() {
    local branch_name="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local test_file=".github/.test-commit-${branch_name}"

    log "Creating test commit on branch: ${branch_name}"

    # Checkout branch
    log "  Checking out branch..."
    if ! git checkout "${branch_name}" &> /dev/null; then
        log "  ERROR: Failed to checkout branch ${branch_name}"
        return 1
    fi

    # Pull latest changes
    log "  Pulling latest changes..."
    if ! git pull origin "${branch_name}" &> /dev/null; then
        log "  WARNING: Failed to pull latest changes (branch may not exist on remote)"
    fi

    # Create or update test file
    cat > "${test_file}" <<EOF
Test commit for CI/CD validation
Branch: ${branch_name}
Timestamp: ${timestamp}
EOF

    # Stage and commit
    log "  Staging test file..."
    if ! git add "${test_file}" &> /dev/null; then
        log "  ERROR: Failed to stage test file"
        return 1
    fi

    local commit_message="test(ci): workflow validation test [${timestamp}]"
    log "  Creating commit..."
    if ! git commit -m "${commit_message}" &> /dev/null; then
        log "  ERROR: Failed to create commit"
        return 1
    fi

    # Get commit SHA
    local commit_sha
    commit_sha=$(get_current_commit_sha)
    log "  Commit created: ${commit_sha}"

    echo "${commit_sha}"
}

push_test_commit() {
    local branch_name="$1"
    local commit_sha="$2"

    log "Pushing commit ${commit_sha} to origin/${branch_name}..."

    if ! git push origin "${branch_name}" 2>&1; then
        log "ERROR: Failed to push to remote"
        return 1
    fi

    log "✅ Successfully pushed to origin/${branch_name}"
    return 0
}

# ========================================================================================
# GITHUB WORKFLOW OPERATIONS
# ========================================================================================

get_latest_workflow_run() {
    local branch_name="$1"

    log "Fetching latest workflow run for branch: ${branch_name}"

    # Wait a few seconds for GitHub to register the push
    sleep 5

    local run_json
    if ! run_json=$(gh run list --branch "${branch_name}" --limit 1 --json databaseId,status,conclusion,createdAt,url 2>&1); then
        log "WARNING: Failed to fetch workflow run. Output: ${run_json}"
        return 1
    fi

    local run_count
    run_count=$(echo "${run_json}" | jq '. | length')

    if [[ "${run_count}" -eq 0 ]]; then
        log "WARNING: No workflow runs found for branch ${branch_name}"
        return 1
    fi

    # Parse first run
    local run_id status conclusion created_at url
    run_id=$(echo "${run_json}" | jq -r '.[0].databaseId')
    status=$(echo "${run_json}" | jq -r '.[0].status')
    conclusion=$(echo "${run_json}" | jq -r '.[0].conclusion // "null"')
    created_at=$(echo "${run_json}" | jq -r '.[0].createdAt')
    url=$(echo "${run_json}" | jq -r '.[0].url')

    log "  Found workflow run: ID=${run_id}, Status=${status}, Conclusion=${conclusion}"
    log "  URL: ${url}"

    # Return as JSON string
    echo "{\"id\":\"${run_id}\",\"status\":\"${status}\",\"conclusion\":\"${conclusion}\",\"createdAt\":\"${created_at}\",\"url\":\"${url}\"}"
}

wait_for_workflow_completion() {
    local run_id="$1"
    local branch_name="$2"
    local timeout_minutes="${3:-60}"

    local start_time
    start_time=$(date +%s)
    local timeout_seconds=$((timeout_minutes * 60))
    local poll_interval_seconds=30

    log "Waiting for workflow run ${run_id} to complete (timeout: ${timeout_minutes} min)..."

    while true; do
        local current_time
        current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ ${elapsed} -gt ${timeout_seconds} ]]; then
            log "⏱️  TIMEOUT: Workflow did not complete within ${timeout_minutes} minutes"
            echo "timeout"
            return
        fi

        # Fetch workflow status
        local run_json
        if ! run_json=$(gh run view "${run_id}" --json status,conclusion,url 2>&1); then
            log "WARNING: Failed to fetch workflow status. Output: ${run_json}"
            sleep "${poll_interval_seconds}"
            continue
        fi

        local status conclusion url
        status=$(echo "${run_json}" | jq -r '.status')
        conclusion=$(echo "${run_json}" | jq -r '.conclusion // "null"')
        url=$(echo "${run_json}" | jq -r '.url')

        local elapsed_min=$((elapsed / 60))
        local elapsed_sec=$((elapsed % 60))
        log "  [$(printf '%02d:%02d' ${elapsed_min} ${elapsed_sec})] Status: ${status}, Conclusion: ${conclusion}"

        if [[ "${status}" == "completed" ]]; then
            if [[ "${conclusion}" == "success" ]]; then
                log "✅ Workflow completed successfully"
                echo "success"
                return
            elif [[ "${conclusion}" == "failure" ]]; then
                log "❌ Workflow failed"
                log "   URL: ${url}"
                echo "failure"
                return
            elif [[ "${conclusion}" == "cancelled" ]]; then
                log "🚫 Workflow was cancelled"
                echo "cancelled"
                return
            else
                log "⚠️  Workflow completed with conclusion: ${conclusion}"
                echo "${conclusion}"
                return
            fi
        fi

        # Still running, wait and poll again
        sleep "${poll_interval_seconds}"
    done
}

# ========================================================================================
# PULL REQUEST OPERATIONS
# ========================================================================================

create_test_pull_request() {
    local head_branch="$1"
    local base_branch="$2"
    local dry_run="${3:-1}"

    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local pr_title="test(ci): Branch policy validation - ${head_branch} -> ${base_branch}"
    local pr_body
    read -r -d '' pr_body <<EOF || true
## CI/CD Test PR

This is an automated test PR created to validate branch policy rules.

- **Source Branch**: ${head_branch}
- **Target Branch**: ${base_branch}
- **Created**: ${timestamp}
- **Purpose**: Validate branch protection and required checks

**This PR should NOT be merged. It will be closed automatically after validation.**
EOF

    if [[ "${dry_run}" == "1" ]]; then
        log "DRY RUN: Would create PR: ${head_branch} -> ${base_branch}"
        log "  Title: ${pr_title}"
        echo "{\"url\":\"dry-run\",\"number\":0,\"dryRun\":true}"
        return
    fi

    log "Creating PR: ${head_branch} -> ${base_branch}"

    local pr_json
    if ! pr_json=$(gh pr create --base "${base_branch}" --head "${head_branch}" --title "${pr_title}" --body "${pr_body}" --json url,number 2>&1); then
        log "ERROR: Failed to create PR. Output: ${pr_json}"
        return 1
    fi

    local pr_url pr_number
    pr_url=$(echo "${pr_json}" | jq -r '.url')
    pr_number=$(echo "${pr_json}" | jq -r '.number')

    log "✅ PR created: #${pr_number}"
    log "   URL: ${pr_url}"

    echo "{\"url\":\"${pr_url}\",\"number\":${pr_number},\"dryRun\":false}"
}

get_pull_request_checks() {
    local pr_url="$1"

    log "Fetching PR checks for: ${pr_url}"

    local checks_output
    if ! checks_output=$(gh pr checks "${pr_url}" 2>&1); then
        log "WARNING: Failed to fetch PR checks. Output: ${checks_output}"
        echo "[]"
        return
    fi

    # Parse gh pr checks output (tab-separated format)
    # Format: NAME\tSTATUS\tCONCLUSION
    local checks="[]"
    while IFS=$'\t' read -r name status conclusion; do
        if [[ -n "${name}" ]]; then
            checks=$(echo "${checks}" | jq --arg name "${name}" --arg status "${status}" --arg conclusion "${conclusion}" \
                '. += [{"name": $name, "status": $status, "conclusion": $conclusion}]')
        fi
    done <<< "${checks_output}"

    echo "${checks}"
}

# ========================================================================================
# TEST PHASES
# ========================================================================================

test_dependencies() {
    log "=================================================="
    log "Dependency Check"
    log "=================================================="

    local all_dependencies_available=0

    # Check git
    if test_command_available git; then
        log "✅ git - Version control"
    else
        log "❌ git - Version control NOT FOUND"
        all_dependencies_available=1
    fi

    # Check gh CLI
    if test_gh_cli_available; then
        log "✅ gh - GitHub CLI"

        # Check authentication
        if test_gh_cli_authenticated; then
            log "✅ gh - Authenticated"
        else
            log "❌ gh - NOT AUTHENTICATED"
            log "   Run: gh auth login"
            all_dependencies_available=1
        fi
    else
        log "❌ gh - GitHub CLI NOT FOUND"
        log "   Install: https://cli.github.com/"
        all_dependencies_available=1
    fi

    if [[ ${all_dependencies_available} -eq 0 ]]; then
        log ""
        log "All required dependencies are available."
        return 0
    else
        log ""
        log "Some required dependencies are missing. Please install them and retry."
        return 1
    fi
}

test_component_trunk_workflows() {
    local branches_to_test="$1"

    log "=================================================="
    log "PHASE 2.1: Component Trunk Branch Workflows"
    log "=================================================="

    local original_branch
    original_branch=$(get_current_branch)
    local failed_branches=0

    for branch in ${branches_to_test}; do
        log ""
        log "--------------------------------------------------"
        log "Testing branch: ${branch}"
        log "--------------------------------------------------"

        # Create test commit
        local commit_sha
        if ! commit_sha=$(create_test_commit "${branch}"); then
            log "❌ Failed to create test commit on ${branch}"
            ((failed_branches++))
            continue
        fi

        # Record commit for potential cleanup
        TEST_COMMITS_BRANCH+=("${branch}")
        TEST_COMMITS_SHA+=("${commit_sha}")

        # Prompt for confirmation
        log ""
        log "Ready to push commit ${commit_sha} to origin/${branch}"
        log "This will trigger GitHub Actions workflows."
        read -p "Continue? (Y/n): " -r confirmation

        if [[ "${confirmation}" == "n" || "${confirmation}" == "N" ]]; then
            log "Skipped push for ${branch}"
            continue
        fi

        # Push commit
        if ! push_test_commit "${branch}" "${commit_sha}"; then
            log "❌ Failed to push commit on ${branch}"
            ((failed_branches++))
            continue
        fi

        # Get workflow run
        local workflow_run
        if ! workflow_run=$(get_latest_workflow_run "${branch}"); then
            log "⚠️  Could not fetch workflow run for ${branch}"
            WORKFLOW_RESULTS_BRANCHES["${branch}"]='{"commit":"'${commit_sha}'","workflowRun":null,"result":"unknown"}'
            continue
        fi

        # Record workflow run
        WORKFLOW_RESULTS_BRANCHES["${branch}"]='{"commit":"'${commit_sha}'","workflowRun":'${workflow_run}',"result":"pending"}'
        ((TOTAL_WORKFLOWS++))

        # Wait for completion if requested
        if [[ "${WAIT_FOR_WORKFLOWS}" == "1" ]]; then
            local run_id
            run_id=$(echo "${workflow_run}" | jq -r '.id')

            local result
            result=$(wait_for_workflow_completion "${run_id}" "${branch}" "${TIMEOUT_MINUTES}")

            # Update result
            local updated_record
            updated_record=$(echo "${WORKFLOW_RESULTS_BRANCHES["${branch}"]}" | jq --arg result "${result}" '.result = $result')
            WORKFLOW_RESULTS_BRANCHES["${branch}"]="${updated_record}"

            if [[ "${result}" == "success" ]]; then
                ((PASSED_WORKFLOWS++))
            elif [[ "${result}" == "timeout" ]]; then
                ((TIMED_OUT_WORKFLOWS++))
                ((failed_branches++))
            else
                ((FAILED_WORKFLOWS++))
                ((failed_branches++))
            fi
        fi
    done

    # Return to original branch
    if [[ -n "${original_branch}" ]]; then
        log ""
        log "Returning to original branch: ${original_branch}"
        git checkout "${original_branch}" &> /dev/null || true
    fi

    if [[ ${failed_branches} -gt 0 ]]; then
        log ""
        log "❌ Component trunk workflow tests: ${failed_branches} failures"
        return 1
    else
        log ""
        log "✅ Component trunk workflow tests completed"
        return 0
    fi
}

test_branch_policy_rules() {
    local component_branches="$1"
    local create_prs="${2:-0}"

    log "=================================================="
    log "PHASE 2.3: Branch Policy Validation"
    log "=================================================="

    if [[ "${create_prs}" == "0" ]]; then
        log "DRY RUN MODE: No PRs will be created"
        log "Set CREATE_PRS=1 to actually create test PRs"
    fi

    local policy_violations=0

    for branch in ${component_branches}; do
        log ""
        log "Testing branch policy: ${branch} -> integration"

        # Create test PR to integration
        local dry_run
        if [[ "${create_prs}" == "1" ]]; then
            dry_run=0
        else
            dry_run=1
        fi

        local pr_result
        if ! pr_result=$(create_test_pull_request "${branch}" "integration" "${dry_run}"); then
            continue
        fi

        local is_dry_run
        is_dry_run=$(echo "${pr_result}" | jq -r '.dryRun')

        if [[ "${is_dry_run}" == "false" ]]; then
            # Record PR
            WORKFLOW_RESULTS_PRS["${branch}"]="${pr_result}"
            ((TOTAL_PRS++))

            # Wait for checks to start
            sleep 10

            # Get PR checks
            local pr_url
            pr_url=$(echo "${pr_result}" | jq -r '.url')
            local checks
            checks=$(get_pull_request_checks "${pr_url}")

            # Update PR result with checks
            pr_result=$(echo "${pr_result}" | jq --argjson checks "${checks}" '.checks = $checks')
            WORKFLOW_RESULTS_PRS["${branch}"]="${pr_result}"

            # Analyze checks
            local failed_checks
            failed_checks=$(echo "${checks}" | jq '[.[] | select(.conclusion == "failure")]')
            local failed_count
            failed_count=$(echo "${failed_checks}" | jq '. | length')

            if [[ ${failed_count} -gt 0 ]]; then
                log "❌ Branch policy violations detected:"
                echo "${failed_checks}" | jq -r '.[] | "   - \(.name): \(.conclusion)"'
                ((policy_violations++))
            else
                log "✅ All required checks passed"
                ((PASSED_PRS++))
            fi

            # Close the test PR
            local pr_number
            pr_number=$(echo "${pr_result}" | jq -r '.number')
            log "Closing test PR #${pr_number}..."
            gh pr close "${pr_number}" --delete-branch=false &> /dev/null || true
        fi
    done

    if [[ ${policy_violations} -gt 0 ]]; then
        FAILED_PRS=${policy_violations}
        log ""
        log "❌ Branch policy validation failed: ${policy_violations} violations"
        return 1
    else
        log ""
        log "✅ Branch policy validation passed"
        return 0
    fi
}

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

main() {
    # Ensure log directory exists
    mkdir -p "${LOG_DIR}"

    # Create inverse-timestamp log file
    local now_year now_month now_day now_hour now_minute now_second
    now_year=$(date +%Y)
    now_month=$(date +%m)
    now_day=$(date +%d)
    now_hour=$(date +%H)
    now_minute=$(date +%M)
    now_second=$(date +%S)

    local inv_year inv_month inv_day inv_hour inv_minute inv_second
    inv_year=$((9999 - now_year))
    inv_month=$((12 - 10#${now_month}))
    inv_day=$((31 - 10#${now_day}))
    inv_hour=$((23 - 10#${now_hour}))
    inv_minute=$((59 - 10#${now_minute}))
    inv_second=$((59 - 10#${now_second}))

    local inverse_timestamp
    inverse_timestamp=$(printf "%04d%02d%02d-%02d%02d%02d" \
        ${inv_year} ${inv_month} ${inv_day} ${inv_hour} ${inv_minute} ${inv_second})

    local timestamp_readable
    timestamp_readable=$(date '+%Y-%m-%d_%H-%M-%S')

    LOG_FILE="${LOG_DIR}/inv${inverse_timestamp}__${timestamp_readable}__${SCRIPT_NAME}.log"

    # Start logging
    log "=================================================="
    log "GitHub Actions Workflow Testing Script"
    log "=================================================="
    log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    log "Repository: ${REPOSITORY}"
    log "Log file: ${LOG_FILE}"
    log ""

    # Dependency check
    if ! test_dependencies; then
        log ""
        log "❌ Dependency check failed. Exiting."
        exit_with_code 3
    fi

    if [[ "${VERIFY_ONLY}" == "1" ]]; then
        log ""
        log "✅ Verify-only mode: Dependencies check complete. Exiting."
        exit_with_code 0
    fi

    log ""

    # Phase 2.1: Component trunk workflows
    local component_result=0
    if [[ "${SKIP_COMPONENT_TRUNKS}" == "0" ]]; then
        test_component_trunk_workflows "${BRANCHES}" || component_result=$?
    else
        log "=================================================="
        log "PHASE 2.1: Component Trunk Workflows (SKIPPED)"
        log "=================================================="
    fi

    # Phase 2.2: Integration and main branch workflows
    if [[ "${SKIP_INTEGRATION}" == "0" ]]; then
        log ""
        log "=================================================="
        log "PHASE 2.2: Integration Branch Workflow (TODO)"
        log "=================================================="
        log "Integration branch testing not yet implemented"
    fi

    if [[ "${SKIP_MAIN}" == "0" ]]; then
        log ""
        log "=================================================="
        log "PHASE 2.2: Main Branch Workflow (TODO)"
        log "=================================================="
        log "Main branch testing not yet implemented"
    fi

    # Phase 2.3: Branch policy validation
    local policy_result=0
    if [[ "${SKIP_BRANCH_POLICY}" == "0" ]]; then
        log ""
        test_branch_policy_rules "${BRANCHES}" "${CREATE_PRS}" || policy_result=$?
    else
        log ""
        log "=================================================="
        log "PHASE 2.3: Branch Policy Validation (SKIPPED)"
        log "=================================================="
    fi

    # Summary
    log ""
    log "=================================================="
    log "SUMMARY"
    log "=================================================="
    log "Workflows:"
    log "  Total:     ${TOTAL_WORKFLOWS}"
    log "  Passed:    ${PASSED_WORKFLOWS}"
    log "  Failed:    ${FAILED_WORKFLOWS}"
    log "  Timed out: ${TIMED_OUT_WORKFLOWS}"
    log ""
    log "Pull Requests:"
    log "  Total:  ${TOTAL_PRS}"
    log "  Passed: ${PASSED_PRS}"
    log "  Failed: ${FAILED_PRS}"
    log ""

    # Determine exit code
    local exit_code=0

    if [[ ${component_result} -ne 0 ]]; then
        log "❌ Component trunk workflows failed"
        exit_code=1
    fi

    if [[ ${policy_result} -ne 0 ]]; then
        log "❌ Branch policy validation failed"
        exit_code=2
    fi

    if [[ ${TIMED_OUT_WORKFLOWS} -gt 0 ]]; then
        log "⏱️  Some workflows timed out"
        if [[ ${exit_code} -eq 0 ]]; then
            exit_code=4
        fi
    fi

    if [[ ${exit_code} -eq 0 ]]; then
        log ""
        log "✅ GitHub Actions workflow testing completed successfully"
    else
        log ""
        log "❌ GitHub Actions workflow testing completed with errors"
    fi

    log ""
    log "Results saved to: ${LOG_DIR}/workflow-results.json"

    if [[ ${#TEST_COMMITS_BRANCH[@]} -gt 0 ]]; then
        log ""
        log "Test commits created (for potential cleanup):"
        for i in "${!TEST_COMMITS_BRANCH[@]}"; do
            log "  ${TEST_COMMITS_BRANCH[$i]}: ${TEST_COMMITS_SHA[$i]}"
        done
    fi

    exit_with_code "${exit_code}"
}

# Error handling
trap 'log "ERROR: Script failed at line $LINENO with exit code $?"; exit_with_code 1' ERR

# Run main
main "$@"
