#!/usr/bin/env bash
#
# Developer environment setup script for CS301 ITSA CRM project (macOS/Linux).
#
# Usage:
#   bash scripts/dev-setup/setup.sh [OPTIONS]
#
# Options:
#   --doctor         Check environment without making changes
#   --skip-verify    Skip verification sequence
#   --verify-only    Only run verification (skip setup)
#   --deploy         Deploy to local kind cluster after verification
#   --deploy-only    Deploy only (no backend/frontend tests) - fast k8s iteration
#   --portable       Install tools to .devtools/bin (DEFAULT)
#   --system         Install tools globally via package manager
#   --persist-path   Persist .devtools/bin in PATH (add to shell RC file)
#
# Examples:
#   bash scripts/dev-setup/setup.sh
#   bash scripts/dev-setup/setup.sh --doctor
#   bash scripts/dev-setup/setup.sh --system --deploy
#

set -euo pipefail

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

# Start overall timer
SETUP_START_TIME=$(date +%s)

DOCTOR=false
SKIP_VERIFY=false
VERIFY_ONLY=false
DEPLOY=false
DEPLOY_ONLY=false
PORTABLE=true
SYSTEM=false
PERSIST_PATH=false

for arg in "$@"; do
    case $arg in
        --doctor) DOCTOR=true ;;
        --skip-verify) SKIP_VERIFY=true ;;
        --verify-only) VERIFY_ONLY=true ;;
        --deploy) DEPLOY=true ;;
        --deploy-only) DEPLOY_ONLY=true ;;
        --portable) PORTABLE=true ;;
        --system) SYSTEM=true; PORTABLE=false ;;
        --persist-path) PERSIST_PATH=true ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# ============================================================================
# INIT & LOGGING
# ============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVTOOLS_DIR="${REPO_ROOT}/.devtools"
DEVTOOLS_BIN="${DEVTOOLS_DIR}/bin"
LOG_DIR="${REPO_ROOT}/build-logs/dev-setup"
year="$(date '+%Y')"
month="$(date '+%m')"
day="$(date '+%d')"
hour="$(date '+%H')"
minute="$(date '+%M')"
second="$(date '+%S')"
timestamp_readable="$(date '+%Y-%m-%d_%H-%M-%S')"
inverse_timestamp="$(printf '%04d%02d%02d-%02d%02d%02d' \
  "$((9999 - 10#${year}))" \
  "$((12 - 10#${month}))" \
  "$((31 - 10#${day}))" \
  "$((23 - 10#${hour}))" \
  "$((59 - 10#${minute}))" \
  "$((59 - 10#${second}))")"
LOG_FILE="${LOG_DIR}/inv${inverse_timestamp}__${timestamp_readable}__setup.log"

mkdir -p "${LOG_DIR}"

# Log rotation: maintain only 3 most recent log files
rotate_logs() {
  local files
  files="$(ls -1 "${LOG_DIR}"/*.log 2>/dev/null | tail -n +4 2>/dev/null || true)"
  if [[ -n "${files}" ]]; then
    while IFS= read -r file; do
      [[ -n "${file}" ]] && rm -f -- "${file}" || true
    done <<< "${files}"
  fi
}
trap rotate_logs EXIT

declare -a ISSUES=()
declare -A TOOL_VERSIONS=()

log() {
    local level="${2:-INFO}"
    local timestamp=$(date +%H:%M:%S)
    local message="[$timestamp][$level] $1"
    echo "$message"
    if [[ "$DOCTOR" != "true" ]]; then
        echo "$message" >> "$LOG_FILE"
    fi
}

log_success() { log "$1" "✓"; }
log_warning() { log "$1" "WARN"; }
log_error() { log "$1" "ERROR"; }
phase_start() {
    local phase_name="$1"
    PHASE_START_TIME=$(date +%s)
    log "========================================"
    log "$phase_name"
    log "========================================"
}

phase_end() {
    local phase_name="$1"
    if [[ -n "${PHASE_START_TIME:-}" ]]; then
        local duration=$(($(date +%s) - PHASE_START_TIME))
        local minutes=$((duration / 60))
        local seconds=$((duration % 60))
        log "[$phase_name] Completed in ${minutes}m ${seconds}s"
        log ""
    fi
}
add_issue() {
    local tool="$1"
    local message="$2"
    local fix="${3:-}"
    ISSUES+=("$tool|$message|$fix")
    log_warning "$tool : $message"
}

if [[ "$DOCTOR" != "true" ]] && [[ ! -d "$LOG_DIR" ]]; then
    mkdir -p "$LOG_DIR"
fi

log "========================================"
log "CS301 ITSA CRM Developer Setup"
log "========================================"
log "Started at: $(date '+%Y-%m-%d %H:%M:%S')"
log "Repo root: $REPO_ROOT"

if [[ "$DOCTOR" == "true" ]]; then
    log "Mode: DOCTOR (read-only diagnostics)"
elif [[ "$VERIFY_ONLY" == "true" ]]; then
    log "Mode: VERIFY ONLY"
else
    log "Mode: SETUP + VERIFY"
    if [[ "$PORTABLE" == "true" ]]; then
        log "Install mode: PORTABLE (.devtools/bin)"
    else
        log "Install mode: SYSTEM (global)"
    fi
fi

if [[ "$DOCTOR" != "true" ]]; then
    log "Log file: $LOG_FILE"
fi
log ""

# ============================================================================
# DETECTED REQUIREMENTS
# ============================================================================

phase_start "DETECTED REQUIREMENTS"
log "Based on repository analysis:"
log ""
log "Required System Dependencies:"
log "  - Docker (Docker Desktop or Docker Engine)"
log "  - Git"
log "  - Java 21 (OpenJDK/Temurin)"
log "  - Node.js >= 18"
log "  - Make (GNU Make)"
log ""
log "Required CLI Tools (can be portable):"
log "  - kubectl"
log "  - helm (v3)"
log "  - kind"
log "  - kubeconform (for k8s validation)"
log ""
log "Optional but Recommended:"
log "  - Python >= 3.7 (for HTML report generation)"
log ""
log "Already in Repo (no install needed):"
log "  - Gradle Wrapper (./gradlew)"
log "  - npm scripts (services/frontend/crm-ui)"
log ""
log "Backend Services:"
log "  - Java: agent, client, transaction (Gradle + Java 21)"
log "  - Python: log service (FastAPI + requirements.txt)"
log ""
log "Frontend:"
log "  - React 19 + TypeScript + Vite"
log "  - Location: services/frontend/crm-ui"
phase_end "Requirements Detection"

# ============================================================================
# OS DETECTION
# ============================================================================

detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

OS_TYPE=$(detect_os)
log "Detected OS: $OS_TYPE"
log ""

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

get_version() {
    local cmd="$1"
    local version_arg="${2:---version}"
    local pattern="${3:-([0-9]+\.[0-9]+(\.[0-9]+)?)}"
    
    if command_exists "$cmd"; then
        local output=$($cmd $version_arg 2>&1 || true)
        if [[ "$output" =~ $pattern ]]; then
            echo "${BASH_REMATCH[1]}"
            return 0
        fi
    fi
    return 1
}

install_portable_tool() {
    local name="$1"
    local version="$2"
    local url="$3"
    local filename="$4"
    local extract_pattern="${5:-}"
    
    local target_path="${DEVTOOLS_BIN}/${filename}"
    
    if [[ -f "$target_path" ]]; then
        log_success "$name already exists in .devtools/bin"
        return 0
    fi
    
    if [[ "$DOCTOR" == "true" ]]; then
        add_issue "$name" "Not found in .devtools/bin" "Will download from $url"
        return 1
    fi
    
    log "Downloading $name $version..."
    
    local temp_file="/tmp/${name}-download"
    
    if ! curl -L -o "$temp_file" "$url"; then
        log_error "Failed to download $name"
        add_issue "$name" "Download failed" "Try manual install from $url"
        return 1
    fi
    
    if [[ -n "$extract_pattern" ]]; then
        local temp_extract="/tmp/${name}-extract"
        rm -rf "$temp_extract"
        mkdir -p "$temp_extract"
        
        if [[ "$url" == *.zip ]]; then
            unzip -q "$temp_file" -d "$temp_extract"
        elif [[ "$url" == *.tar.gz ]] || [[ "$url" == *.tgz ]]; then
            tar -xzf "$temp_file" -C "$temp_extract"
        fi
        
        # Use -path if pattern contains /, otherwise use -name
        local binary=""
        if [[ "$extract_pattern" == */* ]]; then
            binary=$(find "$temp_extract" -path "*/$extract_pattern" -type f | head -n1)
        else
            binary=$(find "$temp_extract" -name "$extract_pattern" -type f | head -n1)
        fi
        
        if [[ -n "$binary" ]]; then
            cp "$binary" "$target_path"
            chmod +x "$target_path"
        else
            log_error "Could not find $extract_pattern in archive"
            log_error "Archive contents:"
            find "$temp_extract" -type f | head -n 20
            rm -rf "$temp_extract"
            return 1
        fi
        
        rm -rf "$temp_extract"
    else
        mv "$temp_file" "$target_path"
        chmod +x "$target_path"
    fi
    
    rm -f "$temp_file"
    log_success "$name installed to .devtools/bin"
    return 0
}

install_system_tool() {
    local name="$1"
    local brew_package="${2:-$name}"
    local apt_package="${3:-$name}"
    local check_command="${4:-$name}"
    
    if command_exists "$check_command"; then
        log_success "$name already installed (system)"
        return 0
    fi
    
    if [[ "$DOCTOR" == "true" ]]; then
        add_issue "$name" "Not found in PATH" "Install via package manager or manually"
        return 1
    fi
    
    log "Installing $name (system)..."
    
    if [[ "$OS_TYPE" == "macos" ]] && command_exists brew; then
        brew install "$brew_package" && log_success "$name installed via brew" && return 0
    elif [[ "$OS_TYPE" == "linux" ]] && command_exists apt-get; then
        sudo apt-get update -qq && sudo apt-get install -y "$apt_package" && log_success "$name installed via apt" && return 0
    fi
    
    add_issue "$name" "Automatic install failed" "Install manually"
    return 1
}

update_session_path() {
    local path_to_add="$1"
    
    if [[ ":$PATH:" != *":$path_to_add:"* ]]; then
        export PATH="$path_to_add:$PATH"
        log "Added $path_to_add to session PATH"
    fi
    
    if [[ "$PERSIST_PATH" == "true" ]] && [[ "$DOCTOR" != "true" ]]; then
        log "Persisting PATH change to shell RC file..."
        
        local rc_file=""
        if [[ -n "${BASH_VERSION:-}" ]]; then
            rc_file="$HOME/.bashrc"
        elif [[ -n "${ZSH_VERSION:-}" ]]; then
            rc_file="$HOME/.zshrc"
        fi
        
        if [[ -n "$rc_file" ]]; then
            if ! grep -q "$path_to_add" "$rc_file" 2>/dev/null; then
                echo "export PATH=\"$path_to_add:\$PATH\"" >> "$rc_file"
                log_success "PATH persisted to $rc_file (restart shell or source it)"
            fi
        else
            log_warning "Could not detect shell RC file for PATH persistence"
        fi
    fi
}

# ============================================================================
# ENVIRONMENT CHECKS
# ============================================================================

phase_start "CHECKING ENVIRONMENT"

# Docker
log "Checking Docker..."
if command_exists docker; then
    docker_version=$(get_version docker --version '([0-9]+\.[0-9]+\.[0-9]+)') || docker_version="unknown"
    TOOL_VERSIONS[docker]="$docker_version"
    log_success "Docker found: $docker_version"
    
    if docker ps >/dev/null 2>&1; then
        log_success "Docker daemon is running"
    else
        add_issue "Docker" "Docker daemon not running" "Start Docker Desktop or Docker service"
    fi
else
    add_issue "Docker" "Not found" "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
fi

# Git
log "Checking Git..."
if command_exists git; then
    git_version=$(get_version git --version '([0-9]+\.[0-9]+\.[0-9]+)') || git_version="unknown"
    TOOL_VERSIONS[git]="$git_version"
    log_success "Git found: $git_version"
else
    add_issue "Git" "Not found" "Install Git from https://git-scm.com/downloads"
fi

# Java
log "Checking Java..."
if command_exists java; then
    java_version=$(get_version java --version '([0-9]+\.[0-9]+\.[0-9]+)') || java_version="unknown"
    java_full=$(java --version 2>&1 | head -n1)
    java_major=""
    if [[ "$java_full" =~ openjdk[[:space:]]([0-9]+) ]]; then
        java_major="${BASH_REMATCH[1]}"
    fi
    
    TOOL_VERSIONS[java]="$java_version"
    log_success "Java found: $java_version (major: $java_major)"
    
    if [[ -n "$java_major" ]] && [[ "$java_major" -lt 21 ]]; then
        add_issue "Java" "Version $java_major found, but Java 21 required" "Install Java 21 from https://adoptium.net/"
    fi
else
    add_issue "Java" "Not found" "Install Java 21 from https://adoptium.net/"
fi

# Node.js
log "Checking Node.js..."
if command_exists node; then
    node_version=$(get_version node --version 'v?([0-9]+\.[0-9]+\.[0-9]+)') || node_version="unknown"
    node_major=""
    if [[ "$node_version" =~ ^([0-9]+)\. ]]; then
        node_major="${BASH_REMATCH[1]}"
    fi
    
    TOOL_VERSIONS[node]="$node_version"
    log_success "Node.js found: $node_version"
    
    if [[ -n "$node_major" ]] && [[ "$node_major" -lt 18 ]]; then
        add_issue "Node.js" "Version $node_version found, but >=18 recommended" "Install Node.js 18+ from https://nodejs.org/"
    fi
else
    add_issue "Node.js" "Not found" "Install Node.js 18+ from https://nodejs.org/"
fi

# npm
if command_exists npm; then
    npm_version=$(get_version npm --version) || npm_version="unknown"
    TOOL_VERSIONS[npm]="$npm_version"
    log_success "npm found: $npm_version"
else
    add_issue "npm" "Not found" "Usually bundled with Node.js"
fi

# Make
log "Checking Make..."
if command_exists make; then
    make_version=$(get_version make --version '([0-9]+\.[0-9]+)') || make_version="unknown"
    TOOL_VERSIONS[make]="$make_version"
    log_success "Make found: $make_version"
else
    add_issue "Make" "Not found" "Install via package manager (brew install make / apt install make)"
fi

# Python (optional)
log "Checking Python..."
python_found=false
for py_cmd in python python3 py; do
    if command_exists "$py_cmd"; then
        if $py_cmd -c "pass" >/dev/null 2>&1; then
            python_version=$(get_version "$py_cmd" --version '([0-9]+\.[0-9]+\.[0-9]+)') || python_version="unknown"
            TOOL_VERSIONS[python]="$python_version"
            log_success "Python found ($py_cmd): $python_version"
            python_found=true
            PYTHON_CMD="$py_cmd"
            break
        fi
    fi
done

if [[ "$python_found" != "true" ]]; then
    log_warning "Python not found (optional). Recommended for HTML report generation."
fi

phase_end "Environment Checks"

# ============================================================================
# CLI TOOLS INSTALLATION
# ============================================================================

phase_start "CLI TOOLS INSTALLATION"

if [[ "$DOCTOR" != "true" ]] && [[ "$PORTABLE" == "true" ]]; then
    if [[ ! -d "$DEVTOOLS_BIN" ]]; then
        log "Creating .devtools/bin directory..."
        mkdir -p "$DEVTOOLS_BIN"
    fi
    update_session_path "$DEVTOOLS_BIN"
fi

# Determine architecture for binary downloads
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    ARCH="amd64"
elif [[ "$ARCH" == "aarch64" ]] || [[ "$ARCH" == "arm64" ]]; then
    ARCH="arm64"
fi

OS_DOWNLOAD=""
if [[ "$OS_TYPE" == "macos" ]]; then
    OS_DOWNLOAD="darwin"
elif [[ "$OS_TYPE" == "linux" ]]; then
    OS_DOWNLOAD="linux"
fi

# kubectl
log "Checking kubectl..."
if command_exists kubectl; then
    kubectl_version=$(get_version kubectl "version --client -o yaml" '([0-9]+\.[0-9]+\.[0-9]+)') || kubectl_version="unknown"
    TOOL_VERSIONS[kubectl]="$kubectl_version"
    log_success "kubectl found: $kubectl_version"
else
    if [[ "$PORTABLE" == "true" ]]; then
        kubectl_url="https://dl.k8s.io/release/v1.31.0/bin/${OS_DOWNLOAD}/${ARCH}/kubectl"
        install_portable_tool "kubectl" "1.31.0" "$kubectl_url" "kubectl"
    else
        install_system_tool "kubectl" "kubectl" "kubectl"
    fi
fi

# helm
log "Checking helm..."
if command_exists helm; then
    helm_version=$(get_version helm "version --short" 'v([0-9]+\.[0-9]+\.[0-9]+)') || helm_version="unknown"
    TOOL_VERSIONS[helm]="$helm_version"
    log_success "helm found: $helm_version"
else
    if [[ "$PORTABLE" == "true" ]]; then
        helm_url="https://get.helm.sh/helm-v3.17.0-${OS_DOWNLOAD}-${ARCH}.tar.gz"
        install_portable_tool "helm" "3.17.0" "$helm_url" "helm" "*/helm"
    else
        install_system_tool "helm" "helm" "helm"
    fi
fi

# kind
log "Checking kind..."
if command_exists kind; then
    kind_version=$(get_version kind version 'v([0-9]+\.[0-9]+\.[0-9]+)') || kind_version="unknown"
    TOOL_VERSIONS[kind]="$kind_version"
    log_success "kind found: $kind_version"
else
    if [[ "$PORTABLE" == "true" ]]; then
        kind_url="https://kind.sigs.k8s.io/dl/v0.26.0/kind-${OS_DOWNLOAD}-${ARCH}"
        install_portable_tool "kind" "0.26.0" "$kind_url" "kind"
    else
        install_system_tool "kind" "kind" "kind"
    fi
fi

# kubeconform
log "Checking kubeconform..."
if command_exists kubeconform; then
    kubeconform_version=$(get_version kubeconform -v 'v?([0-9]+\.[0-9]+\.[0-9]+)') || kubeconform_version="unknown"
    TOOL_VERSIONS[kubeconform]="$kubeconform_version"
    log_success "kubeconform found: $kubeconform_version"
else
    if [[ "$PORTABLE" == "true" ]]; then
        kubeconform_url="https://github.com/yannh/kubeconform/releases/download/v0.6.7/kubeconform-${OS_DOWNLOAD}-${ARCH}.tar.gz"
        install_portable_tool "kubeconform" "0.6.7" "$kubeconform_url" "kubeconform" "kubeconform"
    else
        if [[ "$OS_TYPE" == "macos" ]]; then
            install_system_tool "kubeconform" "kubeconform" "kubeconform"
        else
            # apt doesn't have kubeconform, fallback to portable
            log_warning "kubeconform not in apt, installing portable version..."
            kubeconform_url="https://github.com/yannh/kubeconform/releases/download/v0.6.7/kubeconform-${OS_DOWNLOAD}-${ARCH}.tar.gz"
            install_portable_tool "kubeconform" "0.6.7" "$kubeconform_url" "kubeconform" "kubeconform"
        fi
    fi
fi

phase_end "CLI Tools Installation"

# ============================================================================
# ENVIRONMENT CONFIGURATION
# ============================================================================

if [[ "$DOCTOR" != "true" ]] && [[ "$VERIFY_ONLY" != "true" ]]; then
    phase_start "ENVIRONMENT CONFIGURATION"
    
    # Check for .env.example files
    find "$REPO_ROOT" -name ".env.example" -type f | while read -r env_example; do
        env_dir=$(dirname "$env_example")
        env_file="${env_dir}/.env"
        
        if [[ ! -f "$env_file" ]]; then
            log "Creating .env from template: $env_dir"
            cp "$env_example" "$env_file"
            log_success "Created $env_file (review and update placeholders)"
        else
            log ".env already exists: $env_dir"
        fi
    done
    
    # Initialize Frontend Dependencies
    log ""
    log "Initializing frontend dependencies..."
    frontend_dir="${REPO_ROOT}/services/frontend/crm-ui"
    if [[ -d "$frontend_dir" ]]; then
        pushd "$frontend_dir" >/dev/null
        if [[ -f "package.json" ]]; then
            log "Running npm ci in crm-ui..."
            if npm ci; then
                log_success "Frontend dependencies installed"
            else
                log_warning "npm ci had warnings or errors"
            fi
        fi
        popd >/dev/null
    fi
    
    # Initialize Backend Dependencies
    log ""
    log "Verifying backend Gradle wrappers..."
    for service in agent client transaction; do
        service_dir="${REPO_ROOT}/services/backend/${service}"
        if [[ -d "$service_dir" ]]; then
            if [[ -f "${service_dir}/gradlew" ]]; then
                log_success "$service : Gradle wrapper present"
            else
                log_warning "$service : Gradle wrapper missing"
            fi
        fi
    done
    
    # Initialize Python Dependencies for log service
    log ""
    log "Checking Python log service..."
    log_service_dir="${REPO_ROOT}/services/backend/log"
    if [[ -d "$log_service_dir" ]]; then
        requirements_txt="${log_service_dir}/requirements.txt"
        venv_dir="${log_service_dir}/venv"
        
        if [[ -f "$requirements_txt" ]]; then
            if [[ "$python_found" == "true" ]]; then
                log "Python log service uses requirements.txt"
                
                if [[ ! -d "$venv_dir" ]]; then
                    log "Creating Python venv for log service..."
                    pushd "$log_service_dir" >/dev/null
                    if $PYTHON_CMD -m venv venv; then
                        if venv/bin/pip install -r requirements.txt; then
                            log_success "Python log service venv created and dependencies installed"
                        else
                            log_warning "pip install failed"
                        fi
                    else
                        log_warning "Could not create venv"
                    fi
                    popd >/dev/null
                else
                    log_success "Python log service venv already exists"
                fi
            else
                log_warning "Python not found; log service venv setup skipped"
            fi
        fi
    fi
    
    phase_end "Environment Configuration"
fi

# ============================================================================
# DOCTOR MODE SUMMARY
# ============================================================================

if [[ "$DOCTOR" == "true" ]]; then
    phase_start "DOCTOR SUMMARY"
    
    if [[ ${#ISSUES[@]} -eq 0 ]]; then
        log_success "All checks passed! Environment is ready."
        log ""
        log "Next steps:"
        log "  1. Run this script without --doctor"
        log "  2. Run: bash scripts/dev-setup/setup.sh --verify-only"
        log "  3. Start contributing!"
    else
        log "Found ${#ISSUES[@]} issue(s):"
        log ""
        for issue in "${ISSUES[@]}"; do
            IFS='|' read -r tool message fix <<< "$issue"
            log "  ❌ $tool"
            log "     Problem: $message"
            if [[ -n "$fix" ]]; then
                log "     Fix: $fix"
            fi
            log ""
        done
        
        log "To fix these issues:"
        log "  1. Address manually, OR"
        log "  2. Run: bash scripts/dev-setup/setup.sh (portable install)"
        log "  3. Run: bash scripts/dev-setup/setup.sh --system (system install)"
    fi
    
    phase_end "Doctor Mode"
    
    total_duration=$(($(date +%s) - SETUP_START_TIME))
    minutes=$((total_duration / 60))
    seconds=$((total_duration % 60))
    log ""
    log "Total time: ${minutes}:${seconds}"
    
    exit $(if [[ ${#ISSUES[@]} -eq 0 ]]; then echo 0; else echo 1; fi)
fi

# ============================================================================
# VERIFICATION SEQUENCE
# ============================================================================

if [[ "$SKIP_VERIFY" != "true" ]]; then
    phase_start "VERIFICATION SEQUENCE"
    
    declare -A verification_results
    
    if [[ "$DEPLOY" == "true" ]]; then
        # When --deploy is specified, just run test-and-spinup-all which does:
        # 1. Full test pipeline (backend + frontend)
        # 2. K8s validation
        # 3. K8s deployment
        log "Running complete test and deployment pipeline (test-and-spinup-all)..."
        log ""
        step_start=$(date +%s)
        deploy_script="${REPO_ROOT}/scripts/test-and-spinup-all/test-and-spinup-all.sh"
        if [[ -f "$deploy_script" ]]; then
            if bash "$deploy_script"; then
                step_duration=$(($(date +%s) - step_start))
                step_minutes=$((step_duration / 60))
                step_seconds=$((step_duration % 60))
                log_success "Test and deployment pipeline passed (took ${step_minutes}m ${step_seconds}s)"
                verification_results["deploy"]="PASS"
            else
                log_error "Test and deployment pipeline failed"
                verification_results["deploy"]="FAIL"
            fi
        else
            log_warning "Deploy script not found: $deploy_script"
            verification_results["deploy"]="SKIP"
        fi
    elif [[ "$DEPLOY_ONLY" == "true" ]]; then
        # When --deploy-only is specified, run only the k8s deployment pipeline
        # (no backend/frontend tests). Useful for iterating on k8s issues.
        log "Running deploy-only pipeline (build-and-deploy-k8s-local)..."
        log ""
        step_start=$(date +%s)
        deploy_only_script="${REPO_ROOT}/scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh"
        if [[ -f "$deploy_only_script" ]]; then
            if bash "$deploy_only_script"; then
                step_duration=$(($(date +%s) - step_start))
                step_minutes=$((step_duration / 60))
                step_seconds=$((step_duration % 60))
                log_success "Deploy-only pipeline passed (took ${step_minutes}m ${step_seconds}s)"
                verification_results["deploy"]="PASS"
            else
                log_error "Deploy-only pipeline failed"
                verification_results["deploy"]="FAIL"
            fi
        else
            log_warning "Deploy-only script not found: $deploy_only_script"
            verification_results["deploy"]="SKIP"
        fi
    else
        # Without --deploy, run validation and tests only (no deployment)
        
        # Step 1: K8s manifest validation
        log "Step 1: Running k8s manifest validation (make k8s-validate)..."
        step_start=$(date +%s)
        pushd "$REPO_ROOT" >/dev/null
        # Ensure portable tools are in PATH for the subprocess
        export PATH="${DEVTOOLS_BIN}:${PATH}"
        if make k8s-validate; then
            step_duration=$(($(date +%s) - step_start))
            step_minutes=$((step_duration / 60))
            step_seconds=$((step_duration % 60))
            log_success "k8s validation passed (took ${step_minutes}m ${step_seconds}s)"
            verification_results["k8s-validate"]="PASS"
        else
            log_error "k8s validation failed"
            verification_results["k8s-validate"]="FAIL"
        fi
        popd >/dev/null
        
        # Step 2: Backend pipeline (run even if Step 1 failed)
        log ""
        log "Step 2: Running backend test pipeline..."
        step_start=$(date +%s)
        backend_script="${REPO_ROOT}/scripts/build-and-test-backend/build-and-test-backend.sh"
        if [[ -f "$backend_script" ]]; then
            if bash "$backend_script"; then
                step_duration=$(($(date +%s) - step_start))
                step_minutes=$((step_duration / 60))
                step_seconds=$((step_duration % 60))
                log_success "Backend pipeline passed (took ${step_minutes}m ${step_seconds}s)"
                verification_results["backend"]="PASS"
            else
                log_error "Backend pipeline failed"
                verification_results["backend"]="FAIL"
            fi
        else
            log_warning "Backend pipeline script not found: $backend_script"
            verification_results["backend"]="SKIP"
        fi
        
        # Step 3: Frontend pipeline (run even if previous steps failed)
        log ""
        log "Step 3: Running frontend test pipeline..."
        step_start=$(date +%s)
        frontend_script="${REPO_ROOT}/scripts/build-and-test-frontend/build-and-test-frontend.sh"
        if [[ -f "$frontend_script" ]]; then
            if bash "$frontend_script"; then
                step_duration=$(($(date +%s) - step_start))
                step_minutes=$((step_duration / 60))
                step_seconds=$((step_duration % 60))
                log_success "Frontend pipeline passed (took ${step_minutes}m ${step_seconds}s)"
                verification_results["frontend"]="PASS"
            else
                log_error "Frontend pipeline failed"
                verification_results["frontend"]="FAIL"
            fi
        else
            log_warning "Frontend pipeline script not found: $frontend_script"
            verification_results["frontend"]="SKIP"
        fi
    fi
    
    phase_end "Verification"
    
    # Verification summary
    log ""
    phase_start "VERIFICATION SUMMARY"
    log ""
    log "========================================"
    log "VERIFICATION SUMMARY"
    log "========================================"
    log ""
    
    # Display results table
    has_failures=false
    for step in k8s-validate backend frontend deploy; do
        if [[ -n "${verification_results[$step]:-}" ]]; then
            result="${verification_results[$step]}"
            case "$result" in
                PASS) symbol="✓" ;;
                FAIL) symbol="✗"; has_failures=true ;;
                SKIP) symbol="-" ;;
            esac
            printf "  %-20s : %s\n" "$step" "$result" | tee -a "$LOG_FILE"
        fi
    done
    log ""
    
    if [[ "$has_failures" == "true" ]]; then
        log_error "Verification completed with failures!"
        log ""
        log "Troubleshooting:"
        log "  - Check build logs in: build-logs/"
        log "  - For k8s issues: kubectl get pods -A"
        log "  - For k8s events: kubectl get events -A --sort-by=.metadata.creationTimestamp"
        log "  - Review docs/local-k8s-dev.md"
        log ""
        log "Full log: $LOG_FILE"
        phase_end "Verification Summary"
        
        total_duration=$(($(date +%s) - SETUP_START_TIME))
        minutes=$((total_duration / 60))
        seconds=$((total_duration % 60))
        log ""
        log "Total time: ${minutes}:${seconds}"
        
        exit 1
    else
        log_success "All verification checks passed!"
        phase_end "Verification Summary"
    fi
fi

# ============================================================================
# FINAL SUMMARY
# ============================================================================

log ""
phase_start "SETUP COMPLETE"
log "Detected tool versions:"
for tool in "${!TOOL_VERSIONS[@]}"; do
    printf "  %-15s : %s\n" "$tool" "${TOOL_VERSIONS[$tool]}" | tee -a "$LOG_FILE"
done
log ""

if [[ "$PORTABLE" == "true" ]] && [[ "$PERSIST_PATH" != "true" ]]; then
    log "NOTE: Portable tools installed to .devtools/bin"
    log "      PATH updated for current session only"
    log "      To persist PATH changes, run with --persist-path flag"
    log ""
fi

log "Available commands:"
log "  bash scripts/build-and-test-all/build-and-test-all.sh           - Test all services"
log "  bash scripts/build-and-test-backend/build-and-test-backend.sh   - Test backend only"
log "  bash scripts/build-and-test-frontend/build-and-test-frontend.sh - Test frontend only"
log "  make k8s-validate                                                 - Validate K8s manifests"
log "  bash scripts/test-and-spinup-all/test-and-spinup-all.sh         - Test + deploy to kind"
log "  bash scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh - Deploy only to kind"
log ""
log "Documentation:"
log "  README.md"
log "  docs/onboarding/new-dev-setup.md"
log "  docs/local-k8s-dev.md"
log "  docs/coding-standards/coding-standards.md"
log ""

if [[ "$DOCTOR" != "true" ]]; then
    log "Full log: $LOG_FILE"
fi
phase_end "Setup Complete"

# Calculate and display total duration
total_duration=$(($(date +%s) - SETUP_START_TIME))
minutes=$((total_duration / 60))
seconds=$((total_duration % 60))
log ""
log "========================================"
log "TIMING SUMMARY"
log "========================================"
log "Started:  $(date -d @$SETUP_START_TIME '+%H:%M:%S' 2>/dev/null || date -r $SETUP_START_TIME '+%H:%M:%S')"
log "Finished: $(date '+%H:%M:%S')"
log "Total Duration: ${minutes} minutes ${seconds} seconds"
log "========================================"
log_success "Developer environment ready! 🚀"
exit 0
