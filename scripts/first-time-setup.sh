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
  1. Checks system dependencies (Docker, Git, Java, Node.js, etc.)
  2. Installs CLI tools (kubectl, helm, kind)
  3. Deploys to Kubernetes with VERBOSE mode enabled
  4. Generates comprehensive HTML report

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

log INFO "========================================"
log INFO "FIRST-TIME SETUP WITH TRACING ENABLED"
log INFO "========================================"
log INFO "Log file: $LOG_FILE"
log INFO ""

# Step 1: Check Dependencies
log INFO "Step 1/4: Checking system dependencies..."
if python3 scripts/pipelines/setup_dev_env.py --check-only 2>&1 | tee -a "$LOG_FILE"; then
    log SUCCESS "Dependencies OK!"
else
    log ERROR "Dependency check failed"
    log INFO "Run: python3 scripts/pipelines/setup_dev_env.py"
    exit 1
fi

if [ "$SKIP_DEPLOY" = true ]; then
    log INFO ""
    log WARNING "Skipping deployment (--skip-deploy specified)"
    log SUCCESS "Setup complete! Logs saved to: $LOG_FILE"
    exit 0
fi

# Step 2: Deploy with Verbose Mode
log INFO ""
log INFO "Step 2/4: Deploying to Kubernetes (VERBOSE mode)..."
log INFO "This may take 10-15 minutes on first run..."
log INFO ""

if make build-and-deploy-local VERBOSE=1 2>&1 | tee -a "$LOG_FILE"; then
    log INFO ""
    log SUCCESS "Deployment successful!"
else
    log ERROR "Deployment failed"
    log ERROR "Check logs: $LOG_FILE"
    exit 1
fi

# Step 3: Generate Summary
log INFO ""
log INFO "Step 3/4: Generating deployment report..."

if [ -f "build-logs/build-and-deploy-k8s/deployment-report.html" ]; then
    log SUCCESS "HTML report: build-logs/build-and-deploy-k8s/deployment-report.html"
fi

# Step 4: Final Status
log INFO ""
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
log INFO "  kubectl get pods -A                    # View all pods"
log INFO "  make smoke                             # Run health checks"
log INFO "  kind delete cluster --name cs301-crm  # Clean up"
log INFO ""
