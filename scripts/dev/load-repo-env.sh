#!/usr/bin/env bash
# Source repo-root .env.local (gitignored) into the current shell.
# Usage: source scripts/dev/load-repo-env.sh && load_repo_env "$REPO_ROOT"
load_repo_env() {
  local repo_root="${1:?repo root required}"
  local env_file="${repo_root}/.env.local"
  if [[ -f "${env_file}" ]]; then
    set -a
    # Handle CRLF files created on Windows so values do not keep a trailing \r.
    if grep -q $'\r' "${env_file}"; then
      # shellcheck disable=SC1090
      source <(tr -d '\r' < "${env_file}")
    else
      # shellcheck disable=SC1091
      source "${env_file}"
    fi
    set +a
  fi
}
