#!/usr/bin/env bash
# Wrapper for backend test pipeline (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/test_backend.py" "$@"
