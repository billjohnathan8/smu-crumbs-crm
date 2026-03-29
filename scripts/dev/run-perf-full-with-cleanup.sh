#!/usr/bin/env bash
# scripts/dev/run-perf-full-with-cleanup.sh
#
# Complete performance test lifecycle with resilience validation:
#   1. Start dev stack
#   2. Run 100-thread gradual test (steady-state capacity baseline)
#   3. Run 100-thread burst test (cold start / thundering herd resilience)
#   4. Run 200-thread stress test (breaking point validation) [optional]
#   5. Tear down stack (cleanup)
#
# This is ideal for comprehensive performance validation in a clean environment.
#
# Usage (from repo root):
#   bash scripts/dev/run-perf-full-with-cleanup.sh
#
# Environment variables:
#   SKIP_BURST_TEST=1    Skip burst test (run only gradual test)
#   SKIP_STRESS_TEST=1   Skip stress test (run only capacity tests)
#   PERF_REPEATS=3       Repeats per mode for min/avg/max aggregation
#   PERF_MAX_ERROR_RATE_PCT=1.0   SLO threshold (per repeat)
#   PERF_MAX_P95_MS=5000          SLO threshold (per repeat)

# Fail-fast configuration:
# -e: Exit immediately if any command fails
# -u: Treat unset variables as errors
# -o pipefail: Fail if any command in a pipeline fails
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUN_TS="$(date +%Y%m%d_%H%M%S)"
RUN_ROOT="${ROOT_DIR}/build-logs/performance/full-lifecycle-${RUN_TS}"
PERF_REPEATS="${PERF_REPEATS:-3}"
PERF_MAX_ERROR_RATE_PCT="${PERF_MAX_ERROR_RATE_PCT:-1.0}"
PERF_MAX_P95_MS="${PERF_MAX_P95_MS:-5000}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "[FAIL] Python is required but not found in PATH"
  exit 1
fi

echo ""
echo "========================================================================"
echo "  Performance Test Suite - Full Lifecycle"
echo "  (Stack Up → Gradual → Burst → Stress → Stack Down)"
echo "========================================================================"
echo ""
echo "This script will:"
echo "  1. Start dev stack (~2-3 min)"
echo "  2. Run 100-thread GRADUAL test - steady-state baseline (~2-4 min)"
echo "     └─ 60s ramp-up, tests normal operations"
echo "  3. Run 100-thread BURST test - cold start resilience (~2-4 min)"
echo "     └─ 0s ramp-up, tests thundering herd / traffic spikes"
echo "  4. Run 200-thread STRESS test - breaking point (~12-15 min)"
echo "     └─ Only runs if capacity tests succeed"
echo "  5. Tear down stack (cleanup)"
echo ""
echo "Total duration: ~25-30 minutes (or ~10-15 min if tests skipped)"
echo "Performance repeats per mode: ${PERF_REPEATS}"
echo "SLO gate: error_rate <= ${PERF_MAX_ERROR_RATE_PCT}% and p95 <= ${PERF_MAX_P95_MS}ms"
echo ""
if [ "${SKIP_BURST_TEST:-0}" = "1" ]; then
  echo "⚠️  SKIP_BURST_TEST=1 detected - burst test will be skipped"
fi
if [ "${SKIP_STRESS_TEST:-0}" = "1" ]; then
  echo "⚠️  SKIP_STRESS_TEST=1 detected - stress test will be skipped"
fi
if [ "${SKIP_BURST_TEST:-0}" = "1" ] || [ "${SKIP_STRESS_TEST:-0}" = "1" ]; then
  echo ""
fi
echo "========================================================================"
echo ""

# Track exit status
TEST_EXIT_CODE=0

# Ensure cleanup happens even if test fails
cleanup() {
  local exit_code=$?
  echo ""
  echo "[INFO] Cleaning up - tearing down dev stack..."
  # Use aggressive pruning for performance tests to ensure clean state
  AGGRESSIVE_PRUNE=1 bash "${ROOT_DIR}/scripts/dev/stack-down.sh" || true
  echo "[OK] Stack teardown complete"

  # Return original exit code
  exit ${TEST_EXIT_CODE:-$exit_code}
}

trap cleanup EXIT

# Step 1: Start dev stack
echo ""
echo "========================================="
echo "  Step 1/4: Starting Dev Stack"
echo "========================================="
echo ""

if ! bash "${ROOT_DIR}/scripts/dev/stack-up.sh"; then
  echo ""
  echo "[FAIL] Stack startup failed - aborting immediately"
  echo "[INFO] Check logs in build-logs/dev-stack/ for details"
  TEST_EXIT_CODE=1
  exit 1  # Fail fast - don't continue to performance test
fi

echo ""
echo "[OK] Dev stack is running"
echo ""

# Step 2: Run gradual capacity test (100 threads, 60s ramp-up)
echo ""
echo "========================================="
echo "  Step 2/5: Running GRADUAL Test (100 threads, 60s ramp-up)"
echo "========================================="
echo ""

# Run performance test with SLO gating and repeated aggregation.
set +e
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/performance/run_jmeter_tests.py" \
  --test-mode concurrent \
  --repeats "${PERF_REPEATS}" \
  --slo-max-error-rate-pct "${PERF_MAX_ERROR_RATE_PCT}" \
  --slo-max-p95-ms "${PERF_MAX_P95_MS}" \
  --output-dir "${RUN_ROOT}/concurrent"
GRADUAL_EXIT_CODE=$?
set -e

if [ ${GRADUAL_EXIT_CODE} -ne 0 ]; then
  echo ""
  echo "[FAIL] Gradual test failed with exit code ${GRADUAL_EXIT_CODE} (process/SLO gate)"
  echo "[INFO] Check results in ${RUN_ROOT}/concurrent/summary.json"
  echo "[INFO] Concurrency proof: ${RUN_ROOT}/concurrent/concurrency-proof.{json,md}"
  echo "[INFO] Skipping remaining tests due to gradual test failure"
  TEST_EXIT_CODE=${GRADUAL_EXIT_CODE}
else
  echo ""
  echo "[OK] Gradual test completed successfully"
  echo "[INFO] Gradual summary: ${RUN_ROOT}/concurrent/summary.json"
  echo "[INFO] Gradual concurrency proof: ${RUN_ROOT}/concurrent/concurrency-proof.{json,md}"

  # Step 3: Run burst test (100 threads, 0s ramp-up) if not skipped
  if [ "${SKIP_BURST_TEST:-0}" != "1" ]; then
    echo ""
    echo "========================================="
    echo "  Step 3/5: Running BURST Test (100 threads, 0s ramp-up)"
    echo "========================================="
    echo ""
    echo "[INFO] Testing cold start resilience and thundering herd scenarios..."
    echo ""

    set +e
    "${PYTHON_BIN}" "${ROOT_DIR}/scripts/performance/run_jmeter_tests.py" \
      --test-mode burst \
      --repeats "${PERF_REPEATS}" \
      --slo-max-error-rate-pct "${PERF_MAX_ERROR_RATE_PCT}" \
      --slo-max-p95-ms "${PERF_MAX_P95_MS}" \
      --output-dir "${RUN_ROOT}/burst"
    BURST_EXIT_CODE=$?
    set -e

    if [ ${BURST_EXIT_CODE} -ne 0 ]; then
      echo ""
      echo "[FAIL] Burst test failed with exit code ${BURST_EXIT_CODE} (process/SLO gate)"
      echo "[INFO] Check results in ${RUN_ROOT}/burst/summary.json"
      echo "[INFO] Concurrency proof: ${RUN_ROOT}/burst/concurrency-proof.{json,md}"
      TEST_EXIT_CODE=${BURST_EXIT_CODE}
      echo "[INFO] Skipping stress test due to burst failure"
    else
      echo ""
      echo "[OK] Burst test completed"
      echo "[INFO] Burst summary: ${RUN_ROOT}/burst/summary.json"
      echo "[INFO] Burst concurrency proof: ${RUN_ROOT}/burst/concurrency-proof.{json,md}"
    fi
  else
    echo ""
    echo "[INFO] Skipping burst test (SKIP_BURST_TEST=1)"
  fi

  # Step 4: Run stress test (200 threads) if not skipped
  if [ "${TEST_EXIT_CODE}" -eq 0 ] && [ "${SKIP_STRESS_TEST:-0}" != "1" ]; then
    echo ""
    echo "========================================="
    echo "  Step 4/5: Running STRESS Test (200 threads)"
    echo "========================================="
    echo ""
    echo "[INFO] Starting stress test to validate resilience under overload..."
    echo ""

    set +e
    "${PYTHON_BIN}" "${ROOT_DIR}/scripts/performance/run_jmeter_tests.py" \
      --test-mode stress \
      --repeats "${PERF_REPEATS}" \
      --slo-max-error-rate-pct "${PERF_MAX_ERROR_RATE_PCT}" \
      --slo-max-p95-ms "${PERF_MAX_P95_MS}" \
      --output-dir "${RUN_ROOT}/stress"
    STRESS_EXIT_CODE=$?
    set -e

    if [ ${STRESS_EXIT_CODE} -ne 0 ]; then
      echo ""
      echo "[FAIL] Stress test failed with exit code ${STRESS_EXIT_CODE} (process/SLO gate)"
      echo "[INFO] Check results in ${RUN_ROOT}/stress/summary.json"
      echo "[INFO] Concurrency proof: ${RUN_ROOT}/stress/concurrency-proof.{json,md}"
      TEST_EXIT_CODE=${STRESS_EXIT_CODE}
    else
      echo ""
      echo "[OK] Stress test completed"
      echo "[INFO] Stress summary: ${RUN_ROOT}/stress/summary.json"
      echo "[INFO] Stress concurrency proof: ${RUN_ROOT}/stress/concurrency-proof.{json,md}"
    fi
  else
    echo ""
    if [ "${SKIP_STRESS_TEST:-0}" = "1" ]; then
      echo "[INFO] Skipping stress test (SKIP_STRESS_TEST=1)"
    else
      echo "[INFO] Skipping stress test due to earlier failure"
    fi
  fi
fi

# Prune old full-lifecycle bundles (keep only 3 most recent)
echo ""
echo "[INFO] Pruning old performance test logs (keeping 3 most recent)..."
PERF_LOG_DIR="${ROOT_DIR}/build-logs/performance"
if [ -d "${PERF_LOG_DIR}" ]; then
  KEEP_COUNT=3
  OLD_RUNS=$(find "${PERF_LOG_DIR}" -mindepth 1 -maxdepth 1 -type d -name "full-lifecycle-*" 2>/dev/null | \
    xargs -r ls -dt 2>/dev/null | \
    tail -n +$((KEEP_COUNT + 1)) || echo "")

  if [ -n "${OLD_RUNS}" ]; then
    PRUNE_COUNT=$(echo "${OLD_RUNS}" | wc -l)
    echo "[INFO] Removing ${PRUNE_COUNT} old full-lifecycle run(s)..."
    echo "${OLD_RUNS}" | while IFS= read -r old_dir; do
      rm -rf "${old_dir}"
      echo "  - Removed: $(basename "${old_dir}")"
    done
    echo "[OK] Log pruning complete"
  else
    echo "[OK] No old full-lifecycle logs to prune (${KEEP_COUNT} or fewer runs exist)"
  fi
else
  echo "[INFO] Performance log directory does not exist yet"
fi

# Step 5: Cleanup (handled by trap)
echo ""
echo "========================================="
echo "  Step 5/5: Cleaning Up"
echo "========================================="
echo ""
echo "[INFO] Full lifecycle run root: ${RUN_ROOT}"
echo "[INFO] Per-mode summaries: ${RUN_ROOT}/<mode>/summary.json"
echo "[INFO] Per-mode concurrency proof: ${RUN_ROOT}/<mode>/concurrency-proof.{json,md}"
echo ""

# Exit with test result (cleanup trap will run)
exit ${TEST_EXIT_CODE}
