#!/usr/bin/env bash
# Wrapper for frontend test pipeline (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/test_frontend.py" "$@"
