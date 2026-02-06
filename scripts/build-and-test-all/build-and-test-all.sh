#!/usr/bin/env bash
set -euo pipefail

write_log() {
    local timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] $*"
}

get_python_command() {
    for candidate in python python3 py; do
        if command -v "$candidate" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_LOG_DIR="$REPO_ROOT/build-logs/build-and-test-all"
BACKEND_SCRIPT_DIR="$REPO_ROOT/scripts/build-and-test-backend"
FRONTEND_SCRIPT_DIR="$REPO_ROOT/scripts/build-and-test-frontend"
BACKEND_SCRIPT="$BACKEND_SCRIPT_DIR/build-and-test-backend.sh"
FRONTEND_SCRIPT="$FRONTEND_SCRIPT_DIR/build-and-test-frontend.sh"

mkdir -p "$BUILD_LOG_DIR"

write_log "========================================"
write_log "Full Pipeline: Build and Test All"
write_log "========================================"
write_log ""
write_log "This script will:"
write_log "  1. Run backend pipeline (all backend services)"
write_log "  2. Run frontend pipeline (crm-ui)"
write_log "  3. Generate aggregated coverage report"
write_log ""

HAS_FAILURES=0
BACKEND_STATUS="PASS"
FRONTEND_STATUS="PASS"

# ========================
# Step 1: Run Backend Pipeline
# ========================
write_log "========================================"
write_log "Step 1: Running Backend Pipeline"
write_log "========================================"
write_log ""

if [ -f "$BACKEND_SCRIPT" ]; then
    if bash "$BACKEND_SCRIPT"; then
        write_log "Backend pipeline completed successfully"
    else
        BACKEND_STATUS="FAIL"
        HAS_FAILURES=1
        write_log "Backend pipeline failed with exit code $?"
    fi
else
    BACKEND_STATUS="SKIP"
    write_log "Backend pipeline script not found: $BACKEND_SCRIPT"
fi

write_log ""

# ========================
# Step 2: Run Frontend Pipeline
# ========================
write_log "========================================"
write_log "Step 2: Running Frontend Pipeline"
write_log "========================================"
write_log ""

if [ -f "$FRONTEND_SCRIPT" ]; then
    if bash "$FRONTEND_SCRIPT"; then
        write_log "Frontend pipeline completed successfully"
    else
        FRONTEND_STATUS="FAIL"
        HAS_FAILURES=1
        write_log "Frontend pipeline failed with exit code $?"
    fi
else
    FRONTEND_STATUS="SKIP"
    write_log "Frontend pipeline script not found: $FRONTEND_SCRIPT"
fi

write_log ""

# ========================
# Step 3: Generate Aggregated Coverage Report
# ========================
write_log "========================================"
write_log "Step 3: Generating Aggregated Coverage Report"
write_log "========================================"
write_log ""

PYTHON_COMMAND=""
if get_python_command >/dev/null 2>&1; then
    PYTHON_COMMAND=$(get_python_command)
fi

AGGREGATED_COVERAGE_GENERATOR="$SCRIPT_DIR/generate-aggregated-coverage-index.py"

if [ -n "$PYTHON_COMMAND" ] && [ -f "$AGGREGATED_COVERAGE_GENERATOR" ]; then
    write_log "Generating aggregated coverage report (build-logs/build-and-test-all/index.html)"
    export PYTHONDONTWRITEBYTECODE=1
    if "$PYTHON_COMMAND" "$AGGREGATED_COVERAGE_GENERATOR"; then
        write_log "Aggregated coverage report generated successfully"
    else
        write_log "Warning: Aggregated coverage index generation failed (exitCode=$?)."
    fi
else
    if [ -z "$PYTHON_COMMAND" ]; then
        write_log "Skipping aggregated coverage report generation: Python not available."
    elif [ ! -f "$AGGREGATED_COVERAGE_GENERATOR" ]; then
        write_log "Skipping aggregated coverage report generation: Generator script not found."
    fi
fi

write_log ""

# ========================
# Final Summary
# ========================
write_log "========================================"
write_log "Full Pipeline Summary"
write_log "========================================"
write_log ""

printf "%-20s %s\n" "Component" "Status"
printf "%-20s %s\n" "--------" "------"
printf "%-20s %s\n" "Backend" "$BACKEND_STATUS"
printf "%-20s %s\n" "Frontend" "$FRONTEND_STATUS"

write_log ""
write_log "Coverage Reports:"
write_log "  - Aggregated:  $BUILD_LOG_DIR/index.html"
write_log "  - Backend:     $REPO_ROOT/build-logs/build-and-test-backend/index.html"
write_log "  - Frontend:    $REPO_ROOT/services/frontend/crm-ui/coverage/index.html"
write_log ""

if [ "$HAS_FAILURES" -eq 1 ]; then
    write_log "Status: FAIL - One or more pipelines failed"
    exit 1
else
    write_log "Status: PASS - All pipelines completed successfully"
    exit 0
fi
