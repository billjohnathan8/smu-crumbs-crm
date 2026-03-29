#!/usr/bin/env bash
# scripts/performance/run-100-threads-burst.sh
#
# Run INSTANT BURST load test with 100 threads (0s ramp-up)
# Tests cold start resilience and thundering herd scenarios
#
# Complements run-100-threads.sh (60s ramp-up) by testing burst capacity
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#   - Gradual ramp-up test completed (for comparison)
#
# Usage (from repo root):
#   bash scripts/performance/run-100-threads-burst.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/100-threads-burst/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Test parameters for INSTANT BURST (thundering herd)
HOST="127.0.0.1"
PORT="18088"
THREADS="100"
RAMPUP="0"  # INSTANT BURST: All 100 threads start at t=0
LOOPS="10"
# No think time for burst test - want maximum request rate to stress cold start
THINKTIME="0"

to_windows_path() {
  local input_path="$1"

  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "${input_path}"
    return
  fi

  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "${input_path}"
    return
  fi

  # Fallback for /mnt/<drive>/... (WSL) and /<drive>/... (Git Bash)
  if [[ "${input_path}" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    printf "%s:\\%s\n" "${BASH_REMATCH[1]^^}" "${BASH_REMATCH[2]//\//\\}"
    return
  fi
  if [[ "${input_path}" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    printf "%s:\\%s\n" "${BASH_REMATCH[1]^^}" "${BASH_REMATCH[2]//\//\\}"
    return
  fi

  printf "%s\n" "${input_path}"
}

CMD_C_SWITCH="/c"
case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*) CMD_C_SWITCH="//c" ;;
esac

mkdir -p "${OUTPUT_DIR}"

# Check prerequisites
JMETER_CMD=""
USE_CMD_WRAPPER=0

if command -v jmeter >/dev/null 2>&1; then
  JMETER_CMD="jmeter"
elif command -v jmeter.bat >/dev/null 2>&1; then
  JMETER_CMD="jmeter.bat"
  USE_CMD_WRAPPER=1
elif command -v jmeter.cmd >/dev/null 2>&1; then
  JMETER_CMD="jmeter.cmd"
  USE_CMD_WRAPPER=1
else
  echo "[ERROR] JMeter not found in PATH"
  exit 1
fi

if [ ! -f "${TEST_PLAN}" ]; then
  echo "[ERROR] JMeter test plan not found: ${TEST_PLAN}"
  exit 1
fi

# Verify local stack is running
echo "[INFO] Verifying local dev stack is running..."
if ! curl --silent --fail "http://${HOST}:${PORT}/actuator/health" >/dev/null 2>&1; then
  echo "[ERROR] Local dev stack is not responding on http://${HOST}:${PORT}"
  echo "Please start the stack first: bash scripts/dev/stack-up.sh"
  exit 1
fi
echo "[OK] Local dev stack is running"

echo ""
echo "========================================="
echo "  INSTANT BURST TEST (Thundering Herd)"
echo "========================================="
echo "⚠️  WARNING: This test simulates WORST-CASE burst traffic"
echo "    - All 100 threads start simultaneously (t=0)"
echo "    - Tests cold start resilience"
echo "    - May expose connection pool exhaustion"
echo "    - Higher error rate expected vs gradual ramp-up"
echo ""
echo "Target:     http://${HOST}:${PORT}"
echo "Threads:    ${THREADS} concurrent agents"
echo "Ramp-up:    ${RAMPUP}s (INSTANT - all threads start at once)"
echo "Loops:      ${LOOPS} per thread"
echo "Total Requests: ~$((THREADS * LOOPS * 5))"
echo "Expected Duration: ~1-3 minutes"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""
echo "Compare with gradual ramp-up test:"
echo "  bash scripts/performance/run-100-threads.sh"
echo ""

# Prompt for restart (critical for burst test to measure cold start)
if [[ "${SKIP_RESTART_PROMPT:-0}" == "1" ]]; then
  echo "[INFO] Using existing stack state (automated mode)"
else
  read -p "⚠️  Restart stack for cold start test? (HIGHLY RECOMMENDED) [Y/n]: " RESTART
  if [[ "${RESTART}" =~ ^[Yy]$ ]] || [[ -z "${RESTART}" ]]; then
    echo "[INFO] Restarting local dev stack for cold start..."
    bash "${ROOT_DIR}/scripts/dev/stack-down.sh"
    sleep 5
    bash "${ROOT_DIR}/scripts/dev/stack-up.sh"
    echo "[OK] Stack restarted (cold start)"
    sleep 10
  else
    echo "[INFO] Using existing stack state (warm start - results may differ)"
  fi
fi

echo ""
echo "[INFO] Starting INSTANT BURST test (100 threads at t=0)..."
echo "[INFO] Expected behavior:"
echo "  - Initial spike in latency (connection pool bootstrap)"
echo "  - Possible 1-5% error rate (normal for cold burst)"
echo "  - Database connection contention"
echo ""

# Run JMeter
if [ "$USE_CMD_WRAPPER" -eq 1 ]; then
  WIN_TEST_PLAN=$(to_windows_path "${TEST_PLAN}")
  WIN_OUTPUT_DIR=$(to_windows_path "${OUTPUT_DIR}")

  cmd.exe "${CMD_C_SWITCH}" "$JMETER_CMD" -n \
    -t "${WIN_TEST_PLAN}" \
    -Jhost="${HOST}" \
    -Jport="${PORT}" \
    -Jthreads="${THREADS}" \
    -Jrampup="${RAMPUP}" \
    -Jloops="${LOOPS}" \
    -Jthinktime="${THINKTIME}" \
    -l "${WIN_OUTPUT_DIR}\\results.csv" \
    -e -o "${WIN_OUTPUT_DIR}\\report" \
    -j "${WIN_OUTPUT_DIR}\\jmeter.log"
else
  "$JMETER_CMD" -n \
    -t "${TEST_PLAN}" \
    -Jhost="${HOST}" \
    -Jport="${PORT}" \
    -Jthreads="${THREADS}" \
    -Jrampup="${RAMPUP}" \
    -Jloops="${LOOPS}" \
    -Jthinktime="${THINKTIME}" \
    -l "${OUTPUT_DIR}/results.csv" \
    -e -o "${OUTPUT_DIR}/report" \
    -j "${OUTPUT_DIR}/jmeter.log"
fi

JMETER_EXIT=$?

if [ ${JMETER_EXIT} -eq 0 ]; then
  PERFORMANCE_EXIT=0
  echo ""
  echo "========================================="
  echo "  BURST Test Complete"
  echo "========================================="
  echo "[SUCCESS] JMeter test completed"
  echo ""
  echo "Results:"
  echo "  - CSV:   ${OUTPUT_DIR}/results.csv"
  echo "  - HTML:  ${OUTPUT_DIR}/report/index.html"
  echo "  - Log:   ${OUTPUT_DIR}/jmeter.log"
  echo ""

  if command -v awk >/dev/null 2>&1 && [ -f "${OUTPUT_DIR}/results.csv" ]; then
    echo "Quick Summary:"
    TOTAL_REQUESTS=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | wc -l)
    ERROR_COUNT=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | awk -F',' '{if ($8 == "false") print $0}' | wc -l)
    ERROR_RATE=$(awk "BEGIN {printf \"%.2f\", (${ERROR_COUNT}/${TOTAL_REQUESTS})*100}")

    echo "  - Total Requests: ${TOTAL_REQUESTS}"
    echo "  - Errors: ${ERROR_COUNT}"
    echo "  - Error Rate: ${ERROR_RATE}%"
    echo ""

    # More lenient thresholds for burst test
    if (( $(echo "${ERROR_RATE} < 5.0" | bc -l) )); then
      echo "✅ SUCCESS: Error rate <5% - System handles instant burst well"
    elif (( $(echo "${ERROR_RATE} < 10.0" | bc -l) )); then
      echo "⚠️  ACCEPTABLE: Error rate ${ERROR_RATE}% (burst scenarios often have 5-10% transient errors)"
      echo "   Review errors - connection pool timeouts are expected"
    else
      echo "❌ FAILURE: Error rate ${ERROR_RATE}% (exceeds 10% threshold)"
      echo "   CRITICAL: System cannot handle burst traffic"
      echo "   Common causes: undersized connection pool, missing circuit breakers"
      PERFORMANCE_EXIT=2
    fi
  fi

  echo ""
  echo "Next steps:"
  echo "  1. Compare with gradual ramp-up test:"
  echo "     - Gradual (60s): Tests steady-state capacity"
  echo "     - Burst (0s):    Tests cold start resilience"
  echo ""
  echo "  2. Review burst-specific metrics:"
  echo "     - First 10s error rate (cold start failures)"
  echo "     - P99 latency spike (connection pool bootstrap)"
  echo "     - Error types (timeouts vs application errors)"
  echo ""
  echo "  3. Document in docs/performance/BASELINE.md:"
  echo "     - Steady-state: <1% errors, P95 <100ms"
  echo "     - Burst: <5% errors, P95 <500ms (expected higher)"
  echo ""

  if [ "${PERFORMANCE_EXIT}" -ne 0 ]; then
    echo "[ERROR] Performance thresholds failed (error rate >= 10%)"
    exit "${PERFORMANCE_EXIT}"
  fi
else
  echo ""
  echo "[ERROR] JMeter test failed with exit code ${JMETER_EXIT}"
  echo "Check log file: ${OUTPUT_DIR}/jmeter.log"
  exit ${JMETER_EXIT}
fi
