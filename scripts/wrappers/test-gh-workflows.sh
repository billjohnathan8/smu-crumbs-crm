#!/usr/bin/env bash
# Wrapper for GitHub workflow testing (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/test_github_workflows.py" "$@"
