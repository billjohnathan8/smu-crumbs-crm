#!/usr/bin/env bash
# Wrapper for developer setup (Unix)
# Usage: scripts/wrappers/setup.sh [OPTIONS]

set -euo pipefail

# Get the directory of this script and navigate to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/../.."

# Execute the Python pipeline
exec python "scripts/pipelines/setup_dev_env.py" "$@"
