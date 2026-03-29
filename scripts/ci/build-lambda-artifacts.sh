#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "[FAIL] python3/python is required to build lambda artifacts." >&2
  exit 1
fi

"${PYTHON_CMD}" "${ROOT_DIR}/scripts/ci/build_lambda_artifacts.py"
