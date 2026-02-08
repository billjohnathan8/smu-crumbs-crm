#!/usr/bin/env bash
# Wrapper for unified build pipeline (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/test_all.py" "$@"
