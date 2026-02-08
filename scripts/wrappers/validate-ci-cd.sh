#!/usr/bin/env bash
# Wrapper for CI/CD validation pipeline (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/validate_ci_cd.py" "$@"
