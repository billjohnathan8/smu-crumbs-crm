#!/usr/bin/env bash
# Wrapper for K8s deployment pipeline (Unix)
set -euo pipefail
exec python "$(dirname "$0")/../pipelines/deploy_k8s.py" "$@"
