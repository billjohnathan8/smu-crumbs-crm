#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# scripts/ci/trivy-scan-images.sh
#
# Builds Docker images for all Java backend services and scans each one with
# Trivy using the same settings enforced in the CD pipeline.
#
# Usage:
#   bash scripts/ci/trivy-scan-images.sh [OPTIONS]
#
# Options:
#   --severity LEVELS     Comma-separated severities (default: HIGH,CRITICAL)
#   --exit-code N         1=fail on findings, 0=report only  (default: 1)
#   --no-ignore-unfixed   Include vulnerabilities with no fix yet (default: ignored)
#   --format FORMAT       table | json | sarif                (default: table)
#   --service NAME        user | client | transaction        (default: all)
#
# Examples:
#   # Exact same gate as the CD pipeline (fails on findings):
#   bash scripts/ci/trivy-scan-images.sh
#
#   # Debug mode — full report, no failure exit:
#   bash scripts/ci/trivy-scan-images.sh --exit-code 0
#
#   # Include MEDIUM findings while debugging:
#   bash scripts/ci/trivy-scan-images.sh --severity MEDIUM,HIGH,CRITICAL --exit-code 0
#
#   # Scan one service only:
#   bash scripts/ci/trivy-scan-images.sh --service user --exit-code 0
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── Defaults (match CD pipeline) ─────────────────────────────────────────────
SEVERITY="HIGH,CRITICAL"
EXIT_CODE=1
IGNORE_UNFIXED="--ignore-unfixed"
FORMAT="table"
TARGET_SERVICE=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --severity)          SEVERITY="$2";        shift 2 ;;
    --exit-code)         EXIT_CODE="$2";       shift 2 ;;
    --no-ignore-unfixed) IGNORE_UNFIXED="";    shift   ;;
    --format)            FORMAT="$2";          shift 2 ;;
    --service)           TARGET_SERVICE="$2";  shift 2 ;;
    -h|--help)           sed -n '4,30p' "$0";  exit 0  ;;
    *) echo "[ERROR] Unknown option: $1" >&2;  exit 1  ;;
  esac
done

# ── Dependency checks ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[ERROR] docker is not installed or not on PATH." >&2
  exit 1
fi

if ! command -v trivy &>/dev/null; then
  echo "[ERROR] trivy is not installed or not on PATH." >&2
  echo "  Install: brew install trivy" >&2
  echo "           https://aquasecurity.github.io/trivy/latest/getting-started/installation/" >&2
  exit 1
fi

# ── Service definitions ───────────────────────────────────────────────────────
declare -A SERVICE_DIRS=(
  [user]="services/backend/user"
  [client]="services/backend/client"
  [transaction]="services/backend/transaction"
)
declare -A IMAGE_TAGS=(
  [user]="user:dev"
  [client]="client:dev"
  [transaction]="transaction:dev"
)
SERVICES=("user" "client" "transaction")

if [[ -n "$TARGET_SERVICE" ]]; then
  if [[ -z "${SERVICE_DIRS[$TARGET_SERVICE]+_}" ]]; then
    echo "[ERROR] Unknown service '$TARGET_SERVICE'. Valid: user | client | transaction" >&2
    exit 1
  fi
  SERVICES=("$TARGET_SERVICE")
fi

# ── Banner ────────────────────────────────────────────────────────────────────
TRIVY_VER="$(trivy --version 2>&1 | head -1)"
echo "──────────────────────────────────────────────────────────────"
echo "  Trivy local image scan"
echo "  $TRIVY_VER"
echo "  Severity : $SEVERITY"
echo "  Exit code: $EXIT_CODE  (1=fail on findings, 0=report only)"
echo "  Unfixed  : $([ -n "$IGNORE_UNFIXED" ] && echo 'ignored' || echo 'included')"
echo "  Format   : $FORMAT"
echo "  Services : ${SERVICES[*]}"
echo "──────────────────────────────────────────────────────────────"

# ── Build + Scan ──────────────────────────────────────────────────────────────
OVERALL_STATUS=0

for svc in "${SERVICES[@]}"; do
  dir="${ROOT_DIR}/${SERVICE_DIRS[$svc]}"
  tag="${IMAGE_TAGS[$svc]}"

  echo ""
  (
    cd "$dir"
    chmod +x gradlew
    ./gradlew clean bootJar -x test --no-daemon --console=plain
    docker build -t "$tag" .
  )

  echo ""
  # shellcheck disable=SC2086
  trivy image \
    --format  "$FORMAT" \
    --severity "$SEVERITY" \
    $IGNORE_UNFIXED \
    --exit-code "$EXIT_CODE" \
    "$tag" \
  || { echo "[FAIL] Trivy found vulnerabilities in $tag" >&2; OVERALL_STATUS=1; }

  echo "──────────────────────────────────────────────────────────────"
done

if [[ $OVERALL_STATUS -ne 0 ]]; then
  echo ""
  echo "[FAIL] One or more services failed the Trivy scan."
  echo "  Tip: re-run with --exit-code 0 to see all findings without stopping."
  exit 1
fi

echo ""
echo "[PASS] All scanned images are clean."
