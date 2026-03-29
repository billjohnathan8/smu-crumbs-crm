#!/usr/bin/env bash
# scripts/dev/run-perf-full.sh
#
# Full performance test with 100 concurrent threads for local development.
# Validates CS301 requirement: "Minimum 100 concurrent agents using client-service"
#
# This is a wrapper around scripts/performance/run-100-threads.sh that follows
# the scripts/dev/ convention for developer workflow commands.
#
# Prerequisites:
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (bash scripts/dev/stack-up.sh)
#   - Adequate system resources (8GB+ RAM, 4+ CPU cores)
#
# Usage (from repo root):
#   bash scripts/dev/run-perf-full.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo ""
echo "========================================="
echo "  Full Performance Test (100 Threads)"
echo "========================================="
echo ""
echo "This test validates CS301 requirement for 100 concurrent agents."
echo "Expected duration: ~2-4 minutes"
echo ""
echo "Delegating to: scripts/performance/run-100-threads.sh"
echo ""

# Delegate to the canonical P0 performance script
exec bash "${ROOT_DIR}/scripts/performance/run-100-threads.sh"
