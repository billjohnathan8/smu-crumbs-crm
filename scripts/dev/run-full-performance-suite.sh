#!/usr/bin/env bash
# scripts/dev/run-full-performance-suite.sh
#
# Full Performance Testing Suite
# Runs all performance validation tests in sequence:
#   1. Frontend Latency Tests (Playwright)
#   2. JMeter Backend Performance Tests (100 concurrent threads)
#
# CS301 Requirements Validated:
#   - Frontend latency < 5 seconds
#   - Minimum 100 concurrent agents using client-service
#
# Prerequisites:
#   - Node.js & npm installed
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#
# Usage (from repo root):
#   bash scripts/dev/run-full-performance-suite.sh
#   bash scripts/dev/run-full-performance-suite.sh --skip-frontend
#   bash scripts/dev/run-full-performance-suite.sh --skip-backend

set -euo pipefail

# Parse arguments
SKIP_FRONTEND=0
SKIP_BACKEND=0

for arg in "$@"; do
  case $arg in
    --skip-frontend)
      SKIP_FRONTEND=1
      shift
      ;;
    --skip-backend)
      SKIP_BACKEND=1
      shift
      ;;
    *)
      echo "[ERROR] Unknown argument: $arg"
      echo "Usage: $0 [--skip-frontend] [--skip-backend]"
      exit 1
      ;;
  esac
done

# Color output functions
COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[0;33m'
COLOR_MAGENTA='\033[0;35m'
COLOR_GRAY='\033[0;90m'
COLOR_RESET='\033[0m'

write_section() {
  echo ""
  echo -e "${COLOR_CYAN}=========================================${COLOR_RESET}"
  echo -e "${COLOR_CYAN}  $1${COLOR_RESET}"
  echo -e "${COLOR_CYAN}=========================================${COLOR_RESET}"
  echo ""
}

write_success() {
  echo -e "${COLOR_GREEN}[SUCCESS] $1${COLOR_RESET}"
}

write_error() {
  echo -e "${COLOR_RED}[ERROR] $1${COLOR_RESET}"
}

write_info() {
  echo -e "${COLOR_YELLOW}[INFO] $1${COLOR_RESET}"
}

write_step() {
  echo -e "${COLOR_MAGENTA}[STEP] $1${COLOR_RESET}"
}

# Get script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BUILD_LOGS_DIR="${REPO_ROOT}/build-logs/performance/full-suite/${TIMESTAMP}"

# Create build logs directory
mkdir -p "${BUILD_LOGS_DIR}"

write_section "Full Performance Testing Suite"
echo -e "${COLOR_GRAY}Started: $(date '+%Y-%m-%d %H:%M:%S')${COLOR_RESET}"
echo -e "${COLOR_GRAY}Output Directory: ${BUILD_LOGS_DIR}${COLOR_RESET}"
echo ""

# Initialize result tracking
FRONTEND_RESULT="NOT_RUN"
BACKEND_RESULT="NOT_RUN"
START_TIME=$(date +%s)

# ============================================================================
# PHASE 1: FRONTEND LATENCY TESTS
# ============================================================================

if [ $SKIP_FRONTEND -eq 0 ]; then
  write_section "Phase 1: Frontend Latency Tests"
  write_info "Testing CS301 requirement: Frontend latency < 5 seconds"
  write_info "Test type: Playwright E2E tests with mocked backend"
  echo ""

  write_step "Navigating to frontend directory..."
  FRONTEND_DIR="${REPO_ROOT}/services/frontend/crm-ui"
  cd "${FRONTEND_DIR}"

  write_step "Running: npm run test:e2e:latency"
  echo ""

  # Run frontend latency tests
  set +e
  npm run test:e2e:latency 2>&1 | tee "${BUILD_LOGS_DIR}/frontend-latency.log"
  FRONTEND_EXIT_CODE=$?
  set -e

  cd "${REPO_ROOT}"

  if [ $FRONTEND_EXIT_CODE -eq 0 ]; then
    echo ""
    write_success "Frontend latency tests PASSED"
    FRONTEND_RESULT="PASS"
  else
    echo ""
    write_error "Frontend latency tests FAILED (exit code: $FRONTEND_EXIT_CODE)"
    FRONTEND_RESULT="FAIL"

    echo ""
    write_info "Review test output: ${BUILD_LOGS_DIR}/frontend-latency.log"
    write_info "Playwright HTML report: ${FRONTEND_DIR}/playwright-report/index.html"

    if [ $SKIP_BACKEND -eq 0 ]; then
      echo ""
      read -p "Continue with backend performance tests? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        write_error "Frontend latency tests failed. Aborting."
        exit 1
      fi
    else
      exit 1
    fi
  fi
else
  write_info "Skipping frontend latency tests (--skip-frontend flag)"
  FRONTEND_RESULT="SKIPPED"
fi

# ============================================================================
# PHASE 2: BACKEND PERFORMANCE TESTS (JMeter)
# ============================================================================

if [ $SKIP_BACKEND -eq 0 ]; then
  write_section "Phase 2: Backend Performance Tests (JMeter)"
  write_info "Testing CS301 requirement: Minimum 100 concurrent agents"
  write_info "Test type: 100 concurrent threads, 10 loops each"
  write_info "Expected duration: ~2-4 minutes"
  echo ""

  # Check if JMeter is installed
  write_step "Checking JMeter installation..."
  JMETER_CMD=""
  if command -v jmeter >/dev/null 2>&1; then
    JMETER_CMD="jmeter"
  elif command -v jmeter.bat >/dev/null 2>&1; then
    JMETER_CMD="jmeter.bat"
  elif command -v jmeter.cmd >/dev/null 2>&1; then
    JMETER_CMD="jmeter.cmd"
  else
    write_error "JMeter not found in PATH"
    write_info "Please install Apache JMeter 5.6+ from https://jmeter.apache.org/download_jmeter.cgi"
    exit 1
  fi
  write_success "JMeter found: $(which $JMETER_CMD)"
  echo ""

  # Check if local stack is running
  write_step "Verifying local dev stack is running..."
  if curl --silent --fail "http://127.0.0.1:18088/actuator/health" >/dev/null 2>&1; then
    write_success "Local dev stack is running on http://127.0.0.1:18088"
  else
    write_error "Local dev stack is not responding on http://127.0.0.1:18088"
    write_info "Please start the stack first: bash scripts/dev/stack-up.sh"
    exit 1
  fi
  echo ""

  # Run JMeter test
  write_step "Running JMeter performance test..."
  write_info "Delegating to: scripts/performance/run-100-threads.sh"
  echo ""

  set +e
  bash "${REPO_ROOT}/scripts/performance/run-100-threads.sh" 2>&1 | tee "${BUILD_LOGS_DIR}/backend-performance.log"
  JMETER_EXIT_CODE=$?
  set -e

  if [ $JMETER_EXIT_CODE -eq 0 ]; then
    echo ""
    write_success "Backend performance tests PASSED"
    BACKEND_RESULT="PASS"
  else
    echo ""
    write_error "Backend performance tests FAILED (exit code: $JMETER_EXIT_CODE)"
    BACKEND_RESULT="FAIL"

    echo ""
    write_info "Review test output: ${BUILD_LOGS_DIR}/backend-performance.log"

    # Find the latest JMeter report directory
    JMETER_OUTPUT_DIR="${REPO_ROOT}/build-logs/performance/100-threads-local"
    if [ -d "$JMETER_OUTPUT_DIR" ]; then
      LATEST_REPORT=$(ls -dt "$JMETER_OUTPUT_DIR"/*/ 2>/dev/null | head -n 1)
      if [ -n "$LATEST_REPORT" ]; then
        write_info "JMeter HTML report: ${LATEST_REPORT}report/index.html"
      fi
    fi

    exit 1
  fi
else
  write_info "Skipping backend performance tests (--skip-backend flag)"
  BACKEND_RESULT="SKIPPED"
fi

# ============================================================================
# SUMMARY REPORT
# ============================================================================

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_FORMATTED=$(printf '%02d:%02d:%02d' $((DURATION/3600)) $((DURATION%3600/60)) $((DURATION%60)))

write_section "Performance Testing Suite - Summary"

echo -e "${COLOR_GRAY}Execution Time: ${DURATION_FORMATTED}${COLOR_RESET}"
echo -e "${COLOR_GRAY}Results Directory: ${BUILD_LOGS_DIR}${COLOR_RESET}"
echo ""

# Display results table
echo -e "${COLOR_CYAN}Test Results:${COLOR_RESET}"

echo -n "  1. Frontend Latency Tests:     "
case $FRONTEND_RESULT in
  PASS)    echo -e "${COLOR_GREEN}PASS${COLOR_RESET}" ;;
  FAIL)    echo -e "${COLOR_RED}FAIL${COLOR_RESET}" ;;
  SKIPPED) echo -e "${COLOR_YELLOW}SKIPPED${COLOR_RESET}" ;;
  *)       echo -e "${COLOR_GRAY}NOT RUN${COLOR_RESET}" ;;
esac

echo -n "  2. Backend Performance Tests:  "
case $BACKEND_RESULT in
  PASS)    echo -e "${COLOR_GREEN}PASS${COLOR_RESET}" ;;
  FAIL)    echo -e "${COLOR_RED}FAIL${COLOR_RESET}" ;;
  SKIPPED) echo -e "${COLOR_YELLOW}SKIPPED${COLOR_RESET}" ;;
  *)       echo -e "${COLOR_GRAY}NOT RUN${COLOR_RESET}" ;;
esac

echo ""

# Overall status
if [[ "$FRONTEND_RESULT" =~ ^(PASS|SKIPPED)$ ]] && [[ "$BACKEND_RESULT" =~ ^(PASS|SKIPPED)$ ]]; then
  write_success "All performance tests PASSED!"
  echo ""
  echo -e "${COLOR_GREEN}CS301 Requirements Validated:${COLOR_RESET}"
  echo -e "${COLOR_GREEN}  - Frontend latency < 5 seconds${COLOR_RESET}"
  echo -e "${COLOR_GREEN}  - Minimum 100 concurrent agents${COLOR_RESET}"
  echo ""
  exit 0
else
  echo ""
  write_error "Performance testing suite encountered failures."
  echo ""
  write_info "Review logs in: ${BUILD_LOGS_DIR}"
  echo ""
  exit 1
fi
