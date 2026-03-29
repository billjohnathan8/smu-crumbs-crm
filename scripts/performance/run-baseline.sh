#!/usr/bin/env bash
# scripts/performance/run-baseline.sh
#
# Run baseline performance test with single thread to establish baseline metrics.
# This provides a reference point for comparison with concurrent and stress tests.
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#
# Usage (from repo root):
#   bash scripts/performance/run-baseline.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/baseline-local/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Test parameters for baseline
HOST="127.0.0.1"
PORT="18088"
THREADS="1"
RAMPUP="0"
LOOPS="100"

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

# Display test configuration
echo ""
echo "========================================="
echo "  Baseline Performance Test"
echo "========================================="
echo "Target:     http://${HOST}:${PORT}"
echo "Threads:    ${THREADS} (single thread)"
echo "Ramp-up:    ${RAMPUP}s (immediate start)"
echo "Loops:      ${LOOPS} (${LOOPS} iterations)"
echo "Total Requests: ~$((LOOPS * 5)) (5 requests per loop)"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""
echo "[INFO] Starting baseline test..."
echo "[INFO] This will take approximately $((LOOPS * 5 / 10)) minutes"
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
    -l "${OUTPUT_DIR}/results.csv" \
    -e -o "${OUTPUT_DIR}/report" \
    -j "${OUTPUT_DIR}/jmeter.log"
fi

# Capture exit code
JMETER_EXIT=$?

if [ ${JMETER_EXIT} -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "  Baseline Test Complete"
  echo "========================================="
  echo "[SUCCESS] JMeter test completed successfully"
  echo ""
  echo "Results:"
  echo "  - CSV:   ${OUTPUT_DIR}/results.csv"
  echo "  - HTML:  ${OUTPUT_DIR}/report/index.html"
  echo "  - Log:   ${OUTPUT_DIR}/jmeter.log"
  echo ""
  echo "Next steps:"
  echo "  1. Open HTML report in browser:"
  echo "     start ${OUTPUT_DIR}/report/index.html"
  echo ""
  echo "  2. Document results in docs/performance/BASELINE.md"
  echo ""
  echo "  3. Run 100-thread test:"
  echo "     bash scripts/performance/run-100-threads.sh"
  echo ""
else
  echo ""
  echo "[ERROR] JMeter test failed with exit code ${JMETER_EXIT}"
  echo "Check log file: ${OUTPUT_DIR}/jmeter.log"
  exit ${JMETER_EXIT}
fi
