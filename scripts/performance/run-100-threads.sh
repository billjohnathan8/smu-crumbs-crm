#!/usr/bin/env bash
# scripts/performance/run-100-threads.sh
#
# Run concurrent load test with 100 threads to validate CS301 requirement:
# "Minimum 100 concurrent agents using client-service"
#
# This test validates system capacity under realistic concurrent load.
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#   - Baseline test completed (for comparison)
#
# Usage (from repo root):
#   bash scripts/performance/run-100-threads.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/100-threads-local/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Test parameters for 100 concurrent agents
HOST="127.0.0.1"
PORT="18088"
THREADS="100"
RAMPUP="60"
LOOPS="10"
# Think time (ms) between requests.  Keeps threads alive longer so they overlap
# during the 60 s ramp-up, achieving true concurrent load instead of 2-3 threads.
# 1000 ms → each thread runs ~51 s → ~85 threads active at peak.
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
  echo ""
  echo "Troubleshooting on Windows:"
  echo "  1. Run 'jmeter --version' in PowerShell to verify installation"
  echo "  2. If it works in PowerShell but not here, add JMeter to Git Bash PATH:"
  echo "     echo 'export PATH=\"/c/ProgramData/chocolatey/bin:\$PATH\"' >> ~/.bashrc"
  echo "     source ~/.bashrc"
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

# Warn about system requirements
echo ""
echo "========================================="
echo "  100 Concurrent Agents Test"
echo "========================================="
echo "⚠️  IMPORTANT: This test simulates high load"
echo "    - Ensure adequate system resources (CPU, RAM)"
echo "    - Close resource-intensive applications"
echo "    - Recommend: 8GB+ RAM, 4+ CPU cores"
echo ""
echo "Target:     http://${HOST}:${PORT}"
echo "Threads:    ${THREADS} concurrent agents"
echo "Ramp-up:    ${RAMPUP}s (gradual load increase)"
echo "Loops:      ${LOOPS} per thread"
echo "Think Time: ${THINKTIME}ms between requests"
echo "Total Requests: ~$((THREADS * LOOPS * 5)) (5 requests per loop)"
echo "Expected Duration: ~2-4 minutes"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""

# Prompt for restart confirmation (skip if SKIP_RESTART_PROMPT=1)
if [[ "${SKIP_RESTART_PROMPT:-0}" == "1" ]]; then
  echo "[INFO] Using existing stack state (automated mode)"
else
  read -p "Restart local stack for clean state? (recommended) [Y/n]: " RESTART
  if [[ "${RESTART}" =~ ^[Yy]$ ]] || [[ -z "${RESTART}" ]]; then
    echo "[INFO] Restarting local dev stack..."
    bash "${ROOT_DIR}/scripts/dev/stack-down.sh"
    sleep 5
    bash "${ROOT_DIR}/scripts/dev/stack-up.sh"
    echo "[OK] Stack restarted"
    sleep 10
  else
    echo "[INFO] Using existing stack state"
  fi
fi

echo ""
echo "[INFO] Starting 100-thread concurrent load test..."
echo "[INFO] Monitor system: docker stats"
echo "[INFO] Monitor database: docker exec <postgres> psql -U crm_app -d crm -c 'SELECT count(*) FROM pg_stat_activity;'"
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

if [ ${JMETER_EXIT} -eq 0 ]; then
  PERFORMANCE_EXIT=0
  echo ""
  echo "========================================="
  echo "  100-Thread Test Complete"
  echo "========================================="
  echo "[SUCCESS] JMeter test completed successfully"
  echo ""
  echo "Results:"
  echo "  - CSV:   ${OUTPUT_DIR}/results.csv"
  echo "  - HTML:  ${OUTPUT_DIR}/report/index.html"
  echo "  - Log:   ${OUTPUT_DIR}/jmeter.log"
  echo ""

  # Parse CSV for quick summary (if available)
  if command -v awk >/dev/null 2>&1 && [ -f "${OUTPUT_DIR}/results.csv" ]; then
    echo "Quick Summary:"
    TOTAL_REQUESTS=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | wc -l)
    ERROR_COUNT=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | awk -F',' '{if ($8 == "false") print $0}' | wc -l)
    ERROR_RATE=$(awk "BEGIN {printf \"%.2f\", (${ERROR_COUNT}/${TOTAL_REQUESTS})*100}")

    echo "  - Total Requests: ${TOTAL_REQUESTS}"
    echo "  - Errors: ${ERROR_COUNT}"
    echo "  - Error Rate: ${ERROR_RATE}%"
    echo ""

    if (( $(echo "${ERROR_RATE} < 1.0" | bc -l) )); then
      echo "✅ SUCCESS: Error rate <1% - System handles 100 concurrent agents"
    elif (( $(echo "${ERROR_RATE} < 5.0" | bc -l) )); then
      echo "⚠️  WARNING: Error rate ${ERROR_RATE}% (target <1%, acceptable <5%)"
      echo "   Review errors in HTML report and docs/performance/BOTTLENECK_ANALYSIS.md"
    else
      echo "❌ FAILURE: Error rate ${ERROR_RATE}% (exceeds 5% threshold)"
      echo "   CRITICAL: System cannot handle 100 concurrent agents"
      echo "   Document bottleneck in docs/performance/BOTTLENECK_ANALYSIS.md"
      PERFORMANCE_EXIT=2
    fi
  fi

  echo ""
  echo "Next steps:"
  echo "  1. Open HTML report:"
  echo "     start ${OUTPUT_DIR}/report/index.html"
  echo ""
  echo "  2. Analyze results:"
  echo "     - Check P95 latency (target: <5s)"
  echo "     - Check error rate (target: <1%)"
  echo "     - Compare with baseline metrics"
  echo ""
  echo "  3. Document findings:"
  echo "     - If SUCCESS: Update docs/performance/BASELINE.md with concurrent results"
  echo "     - If FAILURE: Create docs/performance/BOTTLENECK_ANALYSIS.md"
  echo ""
  echo "  4. Run stress test:"
  echo "     bash scripts/performance/run-stress-test.sh"
  echo ""

  if [ "${PERFORMANCE_EXIT}" -ne 0 ]; then
    echo "[ERROR] Performance thresholds failed (error rate >= 5%)"
    exit "${PERFORMANCE_EXIT}"
  fi
else
  echo ""
  echo "[ERROR] JMeter test failed with exit code ${JMETER_EXIT}"
  echo "Check log file: ${OUTPUT_DIR}/jmeter.log"
  echo ""
  echo "Common causes:"
  echo "  - Stack crashed under load (check: docker ps)"
  echo "  - Database connection pool exhausted (check logs)"
  echo "  - JMeter OutOfMemoryError (increase heap: export HEAP='-Xms1g -Xmx4g')"
  echo ""
  exit ${JMETER_EXIT}
fi
