#!/usr/bin/env bash
# setup-env.sh: Common environment setup for all bash scripts
# Source this at the top of any bash script that needs kubectl, helm, kind, etc.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

# Determine repository root
if [[ -n "${REPO_ROOT:-}" ]]; then
    # Already set, use it
    :
elif [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    # Calculate from this script's location
    REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
else
    # Fallback: assume current directory
    REPO_ROOT="$(pwd)"
fi
export REPO_ROOT

# Detect platform
IS_WSL=false
IS_GIT_BASH=false

if [[ "$(uname -r)" =~ Microsoft || "$(uname -r)" =~ WSL ]]; then
    IS_WSL=true
elif [[ -n "${WINDIR:-}" ]] || [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
    IS_GIT_BASH=true
fi

# Function to add directory to PATH if it exists and isn't already in PATH
add_to_path() {
    local dir="$1"
    if [[ -d "${dir}" ]] && [[ ":${PATH}:" != *":${dir}:"* ]]; then
        export PATH="${dir}:${PATH}"
        return 0
    fi
    return 1
}

# Add .devtools/bin (portable tools installed by setup script)
if ${IS_WSL}; then
    # WSL: Add both Unix-style path for the repo and Windows paths
    add_to_path "${REPO_ROOT}/.devtools/bin"
    add_to_path "/mnt/c/ProgramData/chocolatey/bin"

    # Docker Desktop resources (alternative kubectl location)
    if [[ -d "/mnt/c/Program Files/Docker/Docker/resources/bin" ]]; then
        add_to_path "/mnt/c/Program Files/Docker/Docker/resources/bin"
    fi
elif ${IS_GIT_BASH}; then
    # Git Bash on Windows: Use /c/ style paths
    add_to_path "${REPO_ROOT}/.devtools/bin"
    add_to_path "/c/ProgramData/chocolatey/bin"

    # Docker Desktop resources
    if [[ -d "/c/Program Files/Docker/Docker/resources/bin" ]]; then
        add_to_path "/c/Program Files/Docker/Docker/resources/bin"
    fi
else
    # Native Linux/macOS: Just add .devtools/bin
    add_to_path "${REPO_ROOT}/.devtools/bin"
fi

# Function to find a command, preferring .devtools/bin, with optional .exe suffix
find_cmd() {
    local cmd="$1"
    local found_cmd=""

    # Try command without .exe first
    if command -v "${cmd}" >/dev/null 2>&1; then
        found_cmd="${cmd}"
    # Try with .exe suffix (for WSL calling Windows executables)
    elif command -v "${cmd}.exe" >/dev/null 2>&1; then
        found_cmd="${cmd}.exe"
    else
        # Not found, return the base command name (let caller handle error)
        found_cmd="${cmd}"
    fi

    echo "${found_cmd}"
}

# Export commonly used command variables
export KUBECTL_CMD="$(find_cmd kubectl)"
export HELM_CMD="$(find_cmd helm)"
export KIND_CMD="$(find_cmd kind)"
export KUBECONFORM_CMD="$(find_cmd kubeconform)"

# Helper function to convert WSL paths to Windows paths when calling .exe binaries
to_native_path() {
    local path="$1"
    if ${IS_WSL} && [[ "${path}" =~ ^/ ]] && command -v wslpath >/dev/null 2>&1; then
        wslpath -w "${path}"
    else
        echo "${path}"
    fi
}
export -f to_native_path

# Export platform detection flags for scripts that need them
export IS_WSL
export IS_GIT_BASH
