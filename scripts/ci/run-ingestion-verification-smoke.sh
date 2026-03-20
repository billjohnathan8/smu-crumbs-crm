#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Focused local readiness check for:
# 1) transaction ingestion (service scheduler + ingestion lambda path)
# 2) verification email dispatch and feedback flows
FULLSTACK_MODE="${FULLSTACK_MODE:-smoke}" \
VERIFICATION_EMAIL_PROVIDER="${VERIFICATION_EMAIL_PROVIDER:-ses}" \
SES_SENDER_EMAIL="${SES_SENDER_EMAIL:-verification@crm.local}" \
  bash "${ROOT_DIR}/scripts/ci/run-fullstack-integration-e2e.sh"
