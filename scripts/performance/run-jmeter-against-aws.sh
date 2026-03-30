#!/usr/bin/env bash
# scripts/performance/run-jmeter-against-aws.sh
#
# Run performance test against AWS ALB to validate:
#   - ECS autoscaling behavior (1→4 tasks)
#   - ALB load distribution across tasks
#   - RDS connection scaling
#   - CloudWatch alarm triggers
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - AWS Learner Lab deployed (./scripts/deploy-learnerlab.ps1)
#   - ALB DNS name from Terraform output
#
# Usage (from repo root):
#   bash scripts/performance/run-jmeter-against-aws.sh <alb-dns-name>
#
# Example:
#   bash scripts/performance/run-jmeter-against-aws.sh scroogebank-crm-dev-alb-123456789.ap-southeast-1.elb.amazonaws.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${ROOT_DIR}/build-logs/performance/aws-learner-lab/${TIMESTAMP}"
TEST_PLAN="${ROOT_DIR}/tests/performance/agent-crud-workflow.jmx"

# Parse command line arguments
ALB_DNS="${1:-}"

if [[ -z "${ALB_DNS}" ]]; then
  echo "[ERROR] ALB DNS name is required"
  echo ""
  echo "Usage: $0 <alb-dns-name>"
  echo ""
  echo "Get ALB DNS from Terraform output:"
  echo "  cd platform/terraform"
  echo "  terraform output alb_dns_name"
  echo ""
  echo "Example:"
  echo "  $0 scroogebank-crm-dev-alb-123456789.ap-southeast-1.elb.amazonaws.com"
  exit 1
fi

# Test parameters (100 threads for AWS validation)
HOST="${ALB_DNS}"
PORT="80"
THREADS="${2:-100}"  # Allow override via second argument
RAMPUP="${3:-60}"    # Allow override via third argument
LOOPS="${4:-10}"     # Allow override via fourth argument

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

# Verify ALB is reachable
echo "[INFO] Verifying ALB is reachable..."
if ! curl --silent --fail --max-time 10 "http://${HOST}/actuator/health" >/dev/null 2>&1; then
  echo "[WARNING] ALB health check failed: http://${HOST}/actuator/health"
  echo "          This may indicate:"
  echo "          - ALB is not yet deployed"
  echo "          - Target group has no healthy targets"
  echo "          - Security group blocks your IP"
  echo ""
  read -p "Continue anyway? [y/N]: " CONTINUE
  if [[ ! "${CONTINUE}" =~ ^[Yy]$ ]]; then
    echo "[INFO] Aborted by user"
    exit 0
  fi
else
  echo "[OK] ALB is reachable"
fi

# Display test configuration
echo ""
echo "========================================="
echo "  AWS Performance Validation"
echo "========================================="
echo "Target:     http://${HOST}:${PORT}"
echo "Environment: AWS Learner Lab"
echo "Threads:    ${THREADS} concurrent agents"
echo "Ramp-up:    ${RAMPUP}s"
echo "Loops:      ${LOOPS} per thread"
echo "Total Requests: ~$((THREADS * LOOPS * 5))"
echo "Output:     ${OUTPUT_DIR}"
echo "========================================="
echo ""
echo "⚠️  IMPORTANT: Monitor AWS Console during test"
echo ""
echo "What to watch:"
echo "  1. ECS Console → Clusters → scroogebank-crm-dev-cluster"
echo "     - Watch 'Desired count' increase (1→2→3→4)"
echo "     - Monitor CPU/Memory metrics"
echo ""
echo "  2. EC2 Console → Load Balancers → scroogebank-crm-dev-alb"
echo "     - Target Groups → client-service"
echo "     - Verify all targets 'healthy'"
echo "     - Monitor request count distribution"
echo ""
echo "  3. CloudWatch Console"
echo "     - Alarms → Watch for CPU alarm triggers"
echo "     - Metrics → ECS → CPUUtilization"
echo "     - Metrics → RDS → DatabaseConnections"
echo ""
echo "========================================="
echo ""
read -p "Ready to start AWS test? [Y/n]: " START
if [[ "${START}" =~ ^[Nn]$ ]]; then
  echo "[INFO] Aborted by user"
  exit 0
fi

echo ""
echo "[INFO] Starting AWS validation test..."
echo "[INFO] Test duration: ~$((RAMPUP / 60)) min ramp-up + ~$((LOOPS * 5 / 60)) min sustained"
echo ""
echo "CAPTURE EVIDENCE:"
echo "  - Screenshot ECS task count at 0, 5, 10 minutes"
echo "  - Screenshot CloudWatch CPU metrics"
echo "  - Screenshot ALB target group health"
echo "  - Note timestamp when autoscaling occurs"
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
  echo "  AWS Test Complete"
  echo "========================================="
  echo "[SUCCESS] JMeter test completed successfully"
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

    if (( $(echo "${ERROR_RATE} < 1.0" | bc -l) )); then
      echo "✅ SUCCESS: Error rate <1% - AWS deployment handles 100 concurrent agents"
    elif (( $(echo "${ERROR_RATE} < 5.0" | bc -l) )); then
      echo "⚠️  WARNING: Error rate ${ERROR_RATE}% (target <1%, acceptable <5%)"
    else
      echo "❌ FAILURE: Error rate ${ERROR_RATE}% (exceeds 5% threshold)"
    fi
  fi

  echo ""
  echo "========================================="
  echo "  AWS Evidence Collection"
  echo "========================================="
  echo ""
  echo "Did you capture screenshots of:"
  echo "  [ ] ECS task count showing autoscaling (1→N tasks)"
  echo "  [ ] CloudWatch CPU metrics during test"
  echo "  [ ] ALB target group showing all targets healthy"
  echo "  [ ] CloudWatch alarm state transitions"
  echo ""
  echo "Next steps:"
  echo "  1. Open JMeter HTML report:"
  echo "     start ${OUTPUT_DIR}/report/index.html"
  echo ""
  echo "  2. Compare with local test results:"
  echo "     - Throughput: AWS vs Local"
  echo "     - Latency: Impact of network distance"
  echo "     - Error rates: Should be similar or better"
  echo ""
  echo "  3. Document findings in:"
  echo "     docs/performance/AWS_VALIDATION_REPORT.md"
  echo ""
  echo "  4. Answer key questions:"
  echo "     - Did ECS scale from 1 to N tasks?"
  echo "     - What was the scale-out latency?"
  echo "     - Did CloudWatch alarms fire?"
  echo "     - Did ALB distribute load evenly?"
  echo "     - How many concurrent agents did system handle?"
  echo ""
  echo "  5. Retrieve AWS metrics:"
  echo "     - ECS task count over time"
  echo "     - CPU/Memory utilization"
  echo "     - RDS connection count"
  echo "     - ALB request count per target"
  echo ""
else
  echo ""
  echo "[ERROR] JMeter test failed with exit code ${JMETER_EXIT}"
  echo "Check log file: ${OUTPUT_DIR}/jmeter.log"
  echo ""
  echo "Common AWS-specific issues:"
  echo "  - ALB health checks failing (check target group)"
  echo "  - ECS tasks not scaling (check service config)"
  echo "  - Security group blocking traffic (check inbound rules)"
  echo "  - RDS connection limit reached (check CloudWatch)"
  echo ""
  exit ${JMETER_EXIT}
fi

echo ""
echo "========================================="
echo "  Post-Test AWS Checks"
echo "========================================="
echo ""
echo "Run these AWS CLI commands to gather metrics:"
echo ""
echo "1. ECS Task Count:"
echo "   aws ecs describe-services \\"
echo "     --cluster scroogebank-crm-dev-cluster \\"
echo "     --services client-service \\"
echo "     --query 'services[0].[runningCount,desiredCount]'"
echo ""
echo "2. CloudWatch CPU Metrics:"
echo "   aws cloudwatch get-metric-statistics \\"
echo "     --namespace AWS/ECS \\"
echo "     --metric-name CPUUtilization \\"
echo "     --dimensions Name=ServiceName,Value=client-service \\"
echo "     --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \\"
echo "     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \\"
echo "     --period 60 --statistics Average"
echo ""
echo "3. RDS Connections:"
echo "   aws cloudwatch get-metric-statistics \\"
echo "     --namespace AWS/RDS \\"
echo "     --metric-name DatabaseConnections \\"
echo "     --dimensions Name=DBInstanceIdentifier,Value=scroogebank-crm-dev-db \\"
echo "     --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \\"
echo "     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \\"
echo "     --period 60 --statistics Average,Maximum"
echo ""
echo "========================================="
echo ""
