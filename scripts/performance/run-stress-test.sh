#!/usr/bin/env bash
# scripts/performance/run-stress-test.sh
#
# Run stress test with 200 threads to validate CS301 requirement:
# "Perform a stress test to demonstrate resilience"
#
# Stress testing intentionally EXCEEDS system capacity to observe:
#   - Failure modes (error types, rates)
#   - System resilience (no crashes, graceful degradation)
#   - Recovery behavior (returns to baseline after load removed)
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#   - 100-thread test completed (establishes capacity baseline)
#
# Usage (from repo root):
#   bash scripts/performance/run-stress-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/stress-test/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Test parameters for stress test (EXCEEDS capacity)
HOST="127.0.0.1"
PORT="18088"
THREADS="200"
RAMPUP="120"
LOOPS="10"
# Think time (ms) between requests.  Keeps threads alive so they overlap
# during the 120 s ramp-up for sustained concurrent pressure.
THINKTIME="1000"

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

  # Last resort: return as-is
  printf "%s\n" "${input_path}"
}

CMD_C_SWITCH="/c"
case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*) CMD_C_SWITCH="//c" ;;
esac

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check prerequisites - handle Unix (jmeter) and Windows (jmeter.bat/jmeter.cmd)
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
  echo "Please install Apache JMeter 5.6+ from https://jmeter.apache.org/download_jmeter.cgi"
  exit 1
fi

if [ ! -f "${TEST_PLAN}" ]; then
  echo "[ERROR] JMeter test plan not found: ${TEST_PLAN}"
  echo "Expected location: tests/performance/agent-crud-workflow.jmx"
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

# Display stress test warning
echo ""
echo "========================================="
echo "  STRESS TEST (200 Threads)"
echo "========================================="
echo "⚠️  WARNING: This test INTENTIONALLY EXCEEDS system capacity"
echo ""
echo "Purpose:"
echo "  - Observe failure modes under overload"
echo "  - Validate resilience (no crashes)"
echo "  - Measure recovery time after load removed"
echo ""
echo "Expected behavior:"
echo "  - High error rate (5-25%)"
echo "  - Response times >5s"
echo "  - Services remain running (no crashes)"
echo "  - System recovers after test completes"
echo ""
echo "Target:     http://${HOST}:${PORT}"
echo "Threads:    ${THREADS} concurrent agents (DOUBLE capacity)"
echo "Ramp-up:    ${RAMPUP}s (gradual overload)"
echo "Loops:      ${LOOPS} per thread"
echo "Total Requests: ~$((THREADS * LOOPS * 5))"
echo "Expected Duration: ~$((RAMPUP + LOOPS * 10 / 10)) minutes"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""

# Prompt for restart confirmation (MANDATORY for stress test)
# Skip prompt if called from automated test suite (SKIP_RESTART_PROMPT=1)
if [ "${SKIP_RESTART_PROMPT:-0}" = "1" ]; then
  echo "[INFO] Running stress test on existing stack (SKIP_RESTART_PROMPT=1)"
  echo "[INFO] Assuming stack is fresh from previous test run"
else
  echo "[IMPORTANT] Stress test requires fresh stack state"
  read -p "Restart local stack now? (REQUIRED) [Y/n]: " RESTART
  if [[ "${RESTART}" =~ ^[Yy]$ ]] || [[ -z "${RESTART}" ]]; then
    echo "[INFO] Restarting local dev stack..."
    bash "${ROOT_DIR}/scripts/dev/stack-down.sh"
    sleep 5
    bash "${ROOT_DIR}/scripts/dev/stack-up.sh"
    echo "[OK] Stack restarted"
    sleep 10
  else
    echo "[WARNING] Stress test should run on fresh stack for reproducible results"
    read -p "Continue anyway? [y/N]: " CONTINUE
    if [[ ! "${CONTINUE}" =~ ^[Yy]$ ]]; then
      echo "[INFO] Aborted by user"
      exit 0
    fi
  fi
fi

echo ""
echo "[INFO] Starting stress test with 200 threads..."
echo "[INFO] MONITOR SYSTEM:"
echo "       Terminal 1: docker stats"
echo "       Terminal 2: docker logs -f <client-service-container>"
echo "       Terminal 3: docker logs -f <postgres-container>"
echo ""
echo "[INFO] Test will run for ~$((RAMPUP / 60)) minutes ramp-up + ~$((LOOPS * 10 / 60)) minutes sustained load"
echo ""

# Run JMeter in non-GUI mode
# On Windows, invoke .cmd/.bat files through cmd.exe to avoid bash interpretation errors
if [ "$USE_CMD_WRAPPER" -eq 1 ]; then
  # Convert Unix paths to Windows paths for JMeter (Windows program)
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

# Capture exit code
JMETER_EXIT=$?

echo ""
echo "========================================="
echo "  Stress Test Complete"
echo "========================================="

if [ ${JMETER_EXIT} -eq 0 ]; then
  echo "[INFO] JMeter test completed (exit code 0)"
else
  echo "[WARNING] JMeter test exited with code ${JMETER_EXIT}"
  echo "          This is EXPECTED for stress tests (partial failures)"
fi

echo ""
echo "Results:"
echo "  - CSV:   ${OUTPUT_DIR}/results.csv"
echo "  - HTML:  ${OUTPUT_DIR}/report/index.html"
echo "  - Log:   ${OUTPUT_DIR}/jmeter.log"
echo ""

# Parse CSV for quick summary
if command -v awk >/dev/null 2>&1 && [ -f "${OUTPUT_DIR}/results.csv" ]; then
  echo "Quick Summary:"
  TOTAL_REQUESTS=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | wc -l)
  ERROR_COUNT=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | awk -F',' '{if ($8 == "false") print $0}' | wc -l)
  ERROR_RATE=$(awk "BEGIN {printf \"%.2f\", (${ERROR_COUNT}/${TOTAL_REQUESTS})*100}")

  echo "  - Total Requests: ${TOTAL_REQUESTS}"
  echo "  - Errors: ${ERROR_COUNT}"
  echo "  - Error Rate: ${ERROR_RATE}%"
  echo ""

  if (( $(echo "${ERROR_RATE} < 50.0" | bc -l) )); then
    echo "✅ System remained operational under stress (error rate <50%)"
    echo "   Resilience demonstrated - services did not crash"
  else
    echo "❌ System severely degraded (error rate ≥50%)"
    echo "   Check if services crashed: docker ps"
  fi
fi

# Check if services are still running
echo ""
echo "[INFO] Checking service health post-stress..."
sleep 5

if curl --silent --fail "http://${HOST}:${PORT}/actuator/health" >/dev/null 2>&1; then
  echo "✅ Stack is still running after stress test (resilience confirmed)"
else
  echo "❌ Stack is not responding - services may have crashed"
  echo "   Check: docker ps"
  echo "   Recovery test: bash scripts/dev/stack-up.sh"
fi

echo ""
echo "========================================="
echo "  Recovery Test"
echo "========================================="
echo "[INFO] Waiting 2 minutes for system to recover..."
echo "       (Connection pools drain, resources released)"
sleep 120

echo "[INFO] Running baseline test to verify recovery..."
echo ""

# Run single-thread test to verify recovery (no think time for quick baseline check)
# On Windows, invoke .cmd/.bat files through cmd.exe to avoid bash interpretation errors
RECOVERY_CSV="${OUTPUT_DIR}/recovery-test-results.csv"
if [ "$USE_CMD_WRAPPER" -eq 1 ]; then
  # WIN_TEST_PLAN and WIN_OUTPUT_DIR already set from main test
  cmd.exe "${CMD_C_SWITCH}" "$JMETER_CMD" -n \
    -t "${WIN_TEST_PLAN}" \
    -Jhost="${HOST}" \
    -Jport="${PORT}" \
    -Jthreads="1" \
    -Jrampup="0" \
    -Jloops="10" \
    -Jthinktime="0" \
    -l "${WIN_OUTPUT_DIR}\\recovery-test-results.csv" \
    -j "${WIN_OUTPUT_DIR}\\recovery-test.log" 2>&1 | grep -E "(summary|Err:|avg:)"
  RECOVERY_CSV=$(to_windows_path "${OUTPUT_DIR}/recovery-test-results.csv")
  # Normalise to Unix path for parsing below
  RECOVERY_CSV="${OUTPUT_DIR}/recovery-test-results.csv"
else
  "$JMETER_CMD" -n \
    -t "${TEST_PLAN}" \
    -Jhost="${HOST}" \
    -Jport="${PORT}" \
    -Jthreads="1" \
    -Jrampup="0" \
    -Jloops="10" \
    -Jthinktime="0" \
    -l "${OUTPUT_DIR}/recovery-test-results.csv" \
    -j "${OUTPUT_DIR}/recovery-test.log" 2>&1 | grep -E "(summary|Err:|avg:)"
fi

# Parse actual error rate from recovery test CSV (not just grep exit code)
echo ""
if [ -f "${RECOVERY_CSV}" ]; then
  RECOVERY_TOTAL=$(tail -n +2 "${RECOVERY_CSV}" | wc -l | tr -d ' ')
  RECOVERY_ERRORS=$(tail -n +2 "${RECOVERY_CSV}" | awk -F',' '{if ($8 == "false") print $0}' | wc -l | tr -d ' ')

  if [ "${RECOVERY_TOTAL}" -gt 0 ] 2>/dev/null; then
    RECOVERY_ERROR_RATE=$(awk "BEGIN {printf \"%.1f\", (${RECOVERY_ERRORS}/${RECOVERY_TOTAL})*100}")
    echo "[INFO] Recovery test: ${RECOVERY_TOTAL} requests, ${RECOVERY_ERRORS} errors (${RECOVERY_ERROR_RATE}%)"

    if (( $(echo "${RECOVERY_ERROR_RATE} < 10.0" | bc -l 2>/dev/null || echo 0) )); then
      echo "✅ RECOVERY SUCCESSFUL: System returned to baseline performance"
    else
      echo "❌ RECOVERY FAILED: Error rate ${RECOVERY_ERROR_RATE}% (threshold <10%)"
      echo "   Services likely crashed and did not restart."
      echo "   Check: docker ps"
      echo "   Restart: bash scripts/dev/stack-down.sh && bash scripts/dev/stack-up.sh"
    fi
  else
    echo "❌ RECOVERY FAILED: No valid responses received"
    echo "   Services are down. Check: docker ps"
  fi
else
  echo "❌ RECOVERY FAILED: Results CSV not found"
  echo "   JMeter may have failed to connect. Check: docker ps"
fi

echo ""
echo "========================================="
echo "  Next Steps"
echo "========================================="
echo "1. Open HTML report:"
echo "   start ${OUTPUT_DIR}/report/index.html"
echo ""
echo "2. Analyze failure modes:"
echo "   - What error types occurred?"
echo "   - At what thread count did errors start?"
echo "   - Did services crash or gracefully degrade?"
echo ""
echo "3. Document findings in:"
echo "   docs/performance/STRESS_TEST_REPORT.md"
echo ""
echo "4. Capture evidence:"
echo "   - Screenshots of error graphs"
echo "   - Docker logs showing errors"
echo "   - System metrics during peak load"
echo ""
echo "5. Next test: AWS validation"
echo "   bash scripts/performance/run-jmeter-against-aws.sh <alb-dns>"
echo ""
