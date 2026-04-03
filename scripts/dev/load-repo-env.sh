#!/usr/bin/env bash
# Source repo-root .env.local (gitignored) into the current shell.
# Usage: source scripts/dev/load-repo-env.sh && load_repo_env "$REPO_ROOT"
load_repo_env() {
  local repo_root="${1:?repo root required}"
  local env_file="${repo_root}/.env.local"
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${env_file}"
    set +a
  fi
}
