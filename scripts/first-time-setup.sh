#!/usr/bin/env bash
# first-time-setup.sh
# First-time setup script with comprehensive tracing enabled
# This script is designed for new developers setting up the environment for the first time

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function usage() {
    cat <<EOF
First-Time Setup Script with Full Tracing

This script sets up your local development environment with detailed
logging and progress tracking. Perfect for first-time setup!

Usage:
  ./scripts/first-time-setup.sh              # Full setup + deployment
  ./scripts/first-time-setup.sh --skip-deploy  # Setup only, no K8s deployment
  ./scripts/first-time-setup.sh --help         # Show this help

What it does:
  1. Runs environment doctor check
  2. Checks system dependencies and installs missing CLI tools
  3. Deploys to Kubernetes with VERBOSE mode enabled
  4. Generates comprehensive HTML report
  5. On failure: auto-generates support bundle for debugging

Logs are saved to: build-logs/first-time-setup/
EOF
}

# Parse arguments
SKIP_DEPLOY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Find Python: try python3 first, then python
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo -e "${RED}ERROR: Python not found. Install Python 3.8+ and re-run.${NC}"
    echo "  See: docs/prerequisites/PYTHON-REQUIREMENT.md"
    exit 1
fi

# Create log directory
LOG_DIR="build-logs/first-time-setup"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/setup-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

function log() {
    local level=$1
    shift
    local message="$*"
    local color=$NC

    case $level in
        SUCCESS)
            color=$GREEN
            ;;
        WARNING)
            color=$YELLOW
            ;;
        ERROR)
            color=$RED
            ;;
    esac

    local timestamp=$(date +%H:%M:%S)
    local log_msg="[$timestamp] [$level] $message"

    echo -e "${color}${log_msg}${NC}"
    echo "$log_msg" >> "$LOG_FILE"
}

function generate_support_bundle() {
    log WARNING "Generating support bundle for debugging..."
    if $PYTHON scripts/pipelines/support_bundle.py 2>&1 | tee -a "$LOG_FILE"; then
        log INFO "Support bundle generated - share the zip file with the team"
    else
        log WARNING "Support bundle generation failed (non-critical)"
    fi
}

# Trap to generate support bundle on failure
function on_failure() {
    log ERROR "Setup failed! Collecting diagnostics..."
    generate_support_bundle
    log ERROR "Check log file: $LOG_FILE"
    log INFO "Re-run after fixing issues: ./scripts/first-time-setup.sh"
}

log INFO "========================================"
log INFO "FIRST-TIME SETUP WITH TRACING ENABLED"
log INFO "========================================"
log INFO "Log file: $LOG_FILE"
log INFO "Python: $PYTHON ($($PYTHON --version 2>&1))"
log INFO ""

# Step 1: Doctor Check
log INFO "Step 1/5: Running environment doctor check..."
if $PYTHON scripts/pipelines/doctor.py 2>&1 | tee -a "$LOG_FILE"; then
    log SUCCESS "Doctor check passed!"
else
    log WARNING "Doctor check found issues (see above)"
    log INFO "Continuing with setup - some issues may be auto-resolved..."
fi

# Step 2: Setup Dependencies
log INFO ""
log INFO "Step 2/5: Setting up development environment..."
log INFO "This will check dependencies and install missing CLI tools..."
if $PYTHON scripts/pipelines/setup_dev_env.py 2>&1 | tee -a "$LOG_FILE"; then
    log SUCCESS "Environment setup complete!"
else
    setup_exit_code=$?
    log ERROR "Environment setup failed with exit code $setup_exit_code"
    on_failure
    exit 1
fi

if [ "$SKIP_DEPLOY" = true ]; then
    log INFO ""
    log WARNING "Skipping deployment (--skip-deploy specified)"
    log SUCCESS "Setup complete! Logs saved to: $LOG_FILE"
    exit 0
fi

# Step 3: Deploy with Verbose Mode (using Python pipeline for cross-platform consistency)
log INFO ""
log INFO "Step 3/5: Deploying to Kubernetes (VERBOSE mode)..."
log INFO "This may take 10-15 minutes on first run..."
log INFO ""

if $PYTHON scripts/pipelines/deploy_k8s.py --verbose 2>&1 | tee -a "$LOG_FILE"; then
    log INFO ""
    log SUCCESS "Deployment successful!"
else
    log ERROR "Deployment failed"
    on_failure
    exit 1
fi

# Step 4: Generate Summary
log INFO ""
log INFO "Step 4/5: Generating deployment report..."

if [ -f "build-logs/build-and-deploy-k8s/deployment-report.html" ]; then
    log SUCCESS "HTML report: build-logs/build-and-deploy-k8s/deployment-report.html"
fi

# Step 5: Final Status
log INFO ""
log INFO "Step 5/5: Final status"
log INFO "========================================"
log SUCCESS "FIRST-TIME SETUP COMPLETE!"
log INFO "========================================"
log INFO ""
log INFO "Logs saved to: $LOG_FILE"
log INFO ""
log INFO "Access your application at:"
log INFO "  http://localhost/app"
log INFO ""
log INFO "Useful commands:"
log INFO "  python scripts/pipelines/doctor.py      # Check environment health"
log INFO "  kubectl get pods -A                      # View all pods"
log INFO "  make smoke                               # Run health checks"
log INFO "  kind delete cluster --name cs301-crm     # Clean up"
log INFO ""
