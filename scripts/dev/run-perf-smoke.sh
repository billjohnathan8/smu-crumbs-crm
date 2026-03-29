#!/usr/bin/env bash
# scripts/dev/run-perf-smoke.sh
#
# Quick smoke performance test with 10 threads for local development.
# Use this to catch major performance regressions during development.
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#
# Usage (from repo root):
#   bash scripts/dev/run-perf-smoke.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/smoke-local/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Light test parameters for quick developer feedback
HOST="127.0.0.1"
PORT="18088"
THREADS="10"
RAMPUP="10"
LOOPS="5"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check prerequisites - handle Unix (jmeter) and Windows (jmeter.bat/jmeter.cmd)
JMETER_CMD=""
if command -v jmeter >/dev/null 2>&1; then
  JMETER_CMD="jmeter"
elif command -v jmeter.bat >/dev/null 2>&1; then
  JMETER_CMD="jmeter.bat"
elif command -v jmeter.cmd >/dev/null 2>&1; then
  JMETER_CMD="jmeter.cmd"
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

# Display test configuration
echo ""
echo "========================================="
echo "  Performance Smoke Test"
echo "========================================="
echo "Target:     http://${HOST}:${PORT}"
echo "Threads:    ${THREADS} (light load)"
echo "Ramp-up:    ${RAMPUP}s"
echo "Loops:      ${LOOPS} per thread"
echo "Total Requests: ~$((THREADS * LOOPS * 5)) (5 requests per loop)"
echo "Expected Duration: ~$((RAMPUP + LOOPS * 2)) seconds"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""
echo "[INFO] Starting smoke test..."
echo ""

# Run JMeter in non-GUI mode
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

# Capture exit code
JMETER_EXIT=$?

if [ ${JMETER_EXIT} -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "  Smoke Test Complete"
  echo "========================================="
  echo "[SUCCESS] JMeter test completed successfully"
  echo ""

  # Parse CSV for quick summary (if available)
  if command -v awk >/dev/null 2>&1 && [ -f "${OUTPUT_DIR}/results.csv" ]; then
    echo "Quick Summary:"
    TOTAL_REQUESTS=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | wc -l)
    ERROR_COUNT=$(tail -n +2 "${OUTPUT_DIR}/results.csv" | awk -F',' '{if ($8 == "false") print $0}' | wc -l)

    echo "  - Total Requests: ${TOTAL_REQUESTS}"
    echo "  - Errors: ${ERROR_COUNT}"

    if [ "${ERROR_COUNT}" -eq 0 ]; then
      echo ""
      echo "[OK] No errors detected in smoke test"
    else
      ERROR_RATE=$(awk "BEGIN {printf \"%.2f\", (${ERROR_COUNT}/${TOTAL_REQUESTS})*100}")
      echo "  - Error Rate: ${ERROR_RATE}%"
      echo ""
      echo "[WARN] Errors detected - review report"
    fi
  fi

  echo ""
  echo "Results:"
  echo "  - CSV:   ${OUTPUT_DIR}/results.csv"
  echo "  - HTML:  ${OUTPUT_DIR}/report/index.html"
  echo "  - Log:   ${OUTPUT_DIR}/jmeter.log"
  echo ""
  echo "Next steps:"
  echo "  - For full CS301 compliance test: bash scripts/dev/run-perf-full.sh"
  echo "  - For stress test: bash scripts/performance/run-stress-test.sh"
  echo ""
else
  echo ""
  echo "[ERROR] JMeter test failed with exit code ${JMETER_EXIT}"
  echo "Check log file: ${OUTPUT_DIR}/jmeter.log"
  exit ${JMETER_EXIT}
fi
