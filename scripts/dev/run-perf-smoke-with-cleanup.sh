#!/usr/bin/env bash
# scripts/dev/run-perf-smoke-with-cleanup.sh
#
# Quick performance smoke test lifecycle:
#   1. Start dev stack
#   2. Run smoke test (10 threads, 5 loops)
#   3. Tear down stack (cleanup)
#
# This is ideal for quick performance checks during development.
#
# Usage (from repo root):
#   bash scripts/dev/run-perf-smoke-with-cleanup.sh

# Fail-fast configuration:
# -e: Exit immediately if any command fails
# -u: Treat unset variables as errors
# -o pipefail: Fail if any command in a pipeline fails
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo ""
echo "========================================================================"
echo "  Performance Smoke Test - Full Lifecycle (Stack Up → Test → Cleanup)"
echo "========================================================================"
echo ""
echo "This script will:"
echo "  1. Start dev stack (~2-3 min)"
echo "  2. Run smoke test with 10 threads (~30 sec)"
echo "  3. Tear down stack (cleanup)"
echo ""
echo "Total duration: ~3-5 minutes"
echo "========================================================================"
echo ""

# Track exit status
TEST_EXIT_CODE=0

# Ensure cleanup happens even if test fails
cleanup() {
  local exit_code=$?
  echo ""
  echo "[INFO] Cleaning up - tearing down dev stack..."
  bash "${ROOT_DIR}/scripts/dev/stack-down.sh" || true
  echo "[OK] Stack teardown complete"

  # Return test exit code (not cleanup exit code)
  exit ${TEST_EXIT_CODE:-$exit_code}
}

trap cleanup EXIT

# Step 1: Start dev stack
echo ""
echo "========================================="
echo "  Step 1/3: Starting Dev Stack"
echo "========================================="
echo ""

if ! bash "${ROOT_DIR}/scripts/dev/stack-up.sh"; then
  echo ""
  echo "[FAIL] Stack startup failed - aborting immediately"
  echo "[INFO] Check logs in build-logs/dev-stack/ for details"
  TEST_EXIT_CODE=1
  exit 1  # Fail fast - don't continue to smoke test
fi

echo ""
echo "[OK] Dev stack is running"
echo ""

# Step 2: Run smoke test
echo ""
echo "========================================="
echo "  Step 2/3: Running Smoke Test"
echo "========================================="
echo ""

# Run smoke test - capture exit code but don't exit yet (cleanup must run)
set +e  # Temporarily disable exit-on-error for test (we need cleanup to run)
bash "${ROOT_DIR}/scripts/dev/run-perf-smoke.sh"
TEST_EXIT_CODE=$?
set -e  # Re-enable exit-on-error

if [ ${TEST_EXIT_CODE} -ne 0 ]; then
  echo ""
  echo "[FAIL] Smoke test failed with exit code ${TEST_EXIT_CODE}"
  echo "[INFO] Check results in build-logs/performance/ for details"
else
  echo ""
  echo "[OK] Smoke test completed successfully"

  # Find and display results location
  LATEST_RESULT=$(find "${ROOT_DIR}/build-logs/performance" -type d -name "202*" 2>/dev/null | sort -r | head -n1 || echo "")
  if [ -n "${LATEST_RESULT}" ]; then
    echo "[INFO] Results: ${LATEST_RESULT}/report/index.html"
  fi
fi

# Prune old smoke test logs (keep only 3 most recent)
echo ""
echo "[INFO] Pruning old smoke test logs (keeping 3 most recent)..."
SMOKE_LOG_DIR="${ROOT_DIR}/build-logs/performance/smoke-local"
if [ -d "${SMOKE_LOG_DIR}" ]; then
  # Find all timestamped directories, sort by modification time (newest first), keep 3
  KEEP_COUNT=3
  OLD_RUNS=$(find "${SMOKE_LOG_DIR}" -mindepth 1 -maxdepth 1 -type d -name "202*" 2>/dev/null | \
    xargs -r ls -dt 2>/dev/null | \
    tail -n +$((KEEP_COUNT + 1)) || echo "")

  if [ -n "${OLD_RUNS}" ]; then
    PRUNE_COUNT=$(echo "${OLD_RUNS}" | wc -l)
    echo "[INFO] Removing ${PRUNE_COUNT} old test run(s)..."
    echo "${OLD_RUNS}" | while IFS= read -r old_dir; do
      rm -rf "${old_dir}"
      echo "  - Removed: $(basename "${old_dir}")"
    done
    echo "[OK] Log pruning complete"
  else
    echo "[OK] No old logs to prune (${KEEP_COUNT} or fewer runs exist)"
  fi
else
  echo "[INFO] Smoke test log directory does not exist yet"
fi

# Step 3: Cleanup (handled by trap)
echo ""
echo "========================================="
echo "  Step 3/3: Cleaning Up"
echo "========================================="
echo ""

# Exit with test result (cleanup trap will run)
exit ${TEST_EXIT_CODE}
