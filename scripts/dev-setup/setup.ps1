<#
.SYNOPSIS
    Developer environment setup script for CS301-ITSA-Scroogebank-CRM project.

.DESCRIPTION
    One-command setup to prepare a developer machine to contribute to this repo.
    Installs required tools, configures environment, initializes dependencies, and runs verification.
    
    Principles:
    - Portable by default: downloads tools to .devtools/bin (minimal global installs)
    - Idempotent: safe to re-run
    - Self-diagnosing: use --doctor to check status without changes
    - Windows-first with cross-platform support

.PARAMETER Doctor
    Check environment status without making changes. Shows what's missing and provides guidance.

.PARAMETER SkipVerify
    Skip the verification sequence after setup.

.PARAMETER VerifyOnly
    Only run verification (skip setup). Assumes environment is already configured.

.PARAMETER Deploy
    Run full test and deployment pipeline (test-and-spinup-all).
    This runs backend tests, frontend tests, k8s validation, and deploys to local kind cluster.
    Without this flag, only k8s validation and tests are run (no deployment).

.PARAMETER DeployOnly
    Run only the k8s deployment pipeline (build-and-deploy-k8s-local) without backend/frontend tests.
    Useful for iterating on k8s deployment issues when tests already pass.

.PARAMETER Portable
    Install tools to .devtools/bin (DEFAULT). Avoids global installs where possible.

.PARAMETER System
    Install tools globally using package manager (winget/scoop on Windows).

.PARAMETER PersistPath
    Persist .devtools/bin in user PATH permanently. Without this, PATH is only modified for current session.

.EXAMPLE
    .\scripts\dev-setup\setup.ps1
    Setup environment + run k8s validation + run backend tests + run frontend tests (no deployment)

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 -Doctor
    Check environment without making changes

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 -Deploy
    Setup environment + run full test pipeline + deploy to local kind cluster

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 -DeployOnly
    Setup environment + deploy to local kind cluster (no backend/frontend tests)

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 -System -Deploy
    Same as above but install tools globally instead of to .devtools/bin

.LINK
    docs/onboarding/new-dev-setup.md
#>

[CmdletBinding()]
param(
    [switch]$Doctor,
    [switch]$SkipVerify,
    [switch]$VerifyOnly,
    [switch]$Deploy,
    [switch]$DeployOnly,
    [switch]$Portable = $true,
    [switch]$System,
    [switch]$PersistPath
)

# ========================================
#  DEPRECATION WARNING
# ========================================
# This PowerShell script is DEPRECATED and will be removed in 2 weeks.
#
# Please use the new Python pipeline instead:
#   python scripts/pipelines/setup_dev_env.py
#
# The new script works on Windows, macOS, and Linux.
# See: docs/migration/pipeline-migration.md
# ========================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  DEPRECATION WARNING" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "This PowerShell script is deprecated and will be removed in 2 weeks."
Write-Host ""
Write-Host "Please use the new Python pipeline instead:" -ForegroundColor Cyan
Write-Host "  python scripts/pipelines/setup_dev_env.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "The new script works on Windows, macOS, and Linux." -ForegroundColor Green
Write-Host "See: docs/migration/pipeline-migration.md"
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 3

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================================
# INIT & LOGGING
# ============================================================================

# Start overall timer
$script:SetupStartTime = Get-Date

$script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:DevToolsDir = Join-Path $RepoRoot ".devtools"
$script:DevToolsBin = Join-Path $DevToolsDir "bin"
$script:LogDir = Join-Path $RepoRoot "build-logs\dev-setup"
$now = Get-Date
$timestampReadable = $now.ToString("yyyy-MM-dd_HH-mm-ss")
$inverseTimestamp = "{0:D4}{1:D2}{2:D2}-{3:D2}{4:D2}{5:D2}" -f `
    (9999 - $now.Year), `
    (12 - $now.Month), `
    (31 - $now.Day), `
    (23 - $now.Hour), `
    (59 - $now.Minute), `
    (59 - $now.Second)
$script:LogFile = Join-Path $LogDir ("inv{0}__{1}__setup.log" -f $inverseTimestamp, $timestampReadable)

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# Compatibility: if --system is explicitly set, override portable
if ($System) { $Portable = $false }

$script:Issues = @()
$script:ToolVersions = @{}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $line = "[$timestamp][$Level] $Message"
    Write-Host $line
    if (-not $Doctor) {
        Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
    }
}

function Write-Success { Write-Log $args[0] "SUCCESS" }
function Write-Warning { Write-Log $args[0] "WARN" }
function Write-Error { Write-Log $args[0] "ERROR" }

function Write-PhaseStart {
    param([string]$PhaseName)
    $script:PhaseStartTime = Get-Date
    Write-Log "========================================"
    Write-Log "$PhaseName"
    Write-Log "========================================"
}

function Write-PhaseEnd {
    param([string]$PhaseName)
    if ($script:PhaseStartTime) {
        $duration = (Get-Date) - $script:PhaseStartTime
        Write-Log ("[{0}] Completed in {1:mm}m {1:ss}s" -f $PhaseName, $duration)
    }
}

# ============================================================================
# MAIN SCRIPT EXECUTION
# ============================================================================

Write-Log "========================================"
Write-Log "CS301-ITSA-Scroogebank-CRM Developer Setup"
Write-Log "========================================"
Write-Log "Started at: $($script:SetupStartTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Log "Repo root: $RepoRoot"
if ($Doctor) {
    Write-Log "Mode: DOCTOR (read-only diagnostics)"
} elseif ($VerifyOnly) {
    Write-Log "Mode: VERIFY ONLY"
} else {
    Write-Log "Mode: SETUP + VERIFY"
    Write-Log ("Install mode: {0}" -f $(if ($Portable) { "PORTABLE (.devtools/bin)" } else { "SYSTEM (global)" }))
}
if (-not $Doctor) {
    Write-Log "Log file: $LogFile"
}
Write-Log ""

# ============================================================================
# DETECTED REQUIREMENTS (from repo inventory)
# ============================================================================

Write-PhaseStart "DETECTED REQUIREMENTS"
Write-Log "Based on repository analysis:"
Write-Log ""
Write-Log "Required System Dependencies:"
Write-Log "  - Docker Desktop (or Docker Engine)"
Write-Log "  - Git"
Write-Log "  - Java 21 (Temurin/OpenJDK)"
Write-Log "  - Node.js >= 18"
Write-Log "  - Make (GNU Make or Git Bash make)"
Write-Log ""
Write-Log "Required CLI Tools (can be portable):"
Write-Log "  - kubectl"
Write-Log "  - helm (v3)"
Write-Log "  - kind"
Write-Log "  - kubeconform (for k8s validation)"
Write-Log ""
Write-Log "Optional but Recommended:"
Write-Log "  - Python (version 3.7 or higher for HTML report generation)"
Write-Log ""
Write-Log "Already in Repo (no install needed):"
Write-Log "  - Gradle Wrapper (gradlew and gradlew.bat)"
Write-Log "  - npm scripts (services/frontend/crm-ui)"
Write-Log ""
Write-Log "Backend Services:"
Write-Log "  - Java: agent, client, transaction (Gradle + Java 21)"
Write-Log "  - Python: log service (FastAPI + requirements.txt)"
Write-Log ""
Write-Log "Frontend:"
Write-Log "  - React 19 + TypeScript + Vite"
Write-Log "  - Location: services/frontend/crm-ui"
Write-Log ""
Write-Log "Local K8s Workflow:"
Write-Log "  - Cluster: kind (K8s in Docker)"
Write-Log "  - Namespace: dev"
Write-Log "  - Ingress: ingress-nginx"
Write-Log "  - Database: PostgreSQL (Helm chart)"
Write-Log ""
Write-PhaseEnd "Requirements Detection"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Add-Issue {
    param([string]$Tool, [string]$Message, [string]$Fix = "")
    $script:Issues += @{
        Tool = $Tool
        Message = $Message
        Fix = $Fix
    }
    Write-Warning "$Tool : $Message"
}

function Get-ToolVersion {
    param([string]$Command, [string]$VersionArg = "--version", [string]$Pattern = "(\d+\.\d+(\.\d+)?)")
    try {
        $output = & $Command $VersionArg 2>&1 | Out-String
        if ($output -match $Pattern) {
            return $matches[1]
        }
    } catch {
        return $null
    }
    return $null
}

function Test-AdminRights {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-PortableTool {
    param(
        [string]$Name,
        [string]$Version,
        [string]$Url,
        [string]$FileName,
        [string]$ExtractPattern = $null,
        [scriptblock]$PostInstall = $null
    )
    
    $targetPath = Join-Path $DevToolsBin $FileName
    
    if (Test-Path $targetPath) {
        Write-Success "$Name already exists in .devtools/bin"
        return $true
    }
    
    if ($Doctor) {
        Add-Issue $Name "Not found in .devtools/bin" "Will download from $Url"
        return $false
    }
    
    Write-Log "Downloading $Name $Version..."
    
    try {
        # Preserve the URL file extension so Expand-Archive recognises .zip files
        $urlExtension = if ($Url -match '(\.\w+)$') { $matches[1] } else { "" }
        $tempFile = Join-Path $env:TEMP "$Name-download$urlExtension"
        Invoke-WebRequest -Uri $Url -OutFile $tempFile -UseBasicParsing
        
        if ($ExtractPattern) {
            # Extract archive
            $tempExtract = Join-Path $env:TEMP "$Name-extract"
            if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
            New-Item -ItemType Directory -Path $tempExtract | Out-Null
            
            # Use native Expand-Archive or 7-Zip
            if ($Url -match "\.zip$") {
                Expand-Archive -Path $tempFile -DestinationPath $tempExtract -Force
            } elseif ($Url -match "\.(tar\.gz|tgz)$") {
                # Windows 10+ has tar built-in
                tar -xzf $tempFile -C $tempExtract
            }
            
            # Find the binary
            $binary = Get-ChildItem -Path $tempExtract -Recurse -Filter $ExtractPattern | Select-Object -First 1
            if ($binary) {
                Copy-Item $binary.FullName -Destination $targetPath -Force
            } else {
                throw "Could not find $ExtractPattern in extracted archive"
            }
            
            Remove-Item $tempExtract -Recurse -Force
        } else {
            # Direct binary download
            Move-Item $tempFile $targetPath -Force
        }
        
        Remove-Item $tempFile -ErrorAction SilentlyContinue
        
        if ($PostInstall) {
            & $PostInstall
        }
        
        Write-Success "$Name installed to .devtools/bin"
        return $true
    } catch {
        Write-Error "Failed to install $Name : $_"
        Add-Issue $Name "Installation failed" "Try manual install from $Url"
        return $false
    }
}

function Install-SystemTool {
    param(
        [string]$Name,
        [string]$WingetId = $null,
        [string]$ScoopPackage = $null,
        [string]$CheckCommand = $Name
    )
    
    if (Test-CommandExists $CheckCommand) {
        Write-Success "$Name already installed (system)"
        return $true
    }
    
    if ($Doctor) {
        Add-Issue $Name "Not found in PATH" "Install via winget/scoop or manually"
        return $false
    }
    
    Write-Log "Installing $Name (system)..."
    
    # Try winget first
    if ($WingetId -and (Test-CommandExists "winget")) {
        try {
            $installArgs = @("install", "--id", $WingetId, "--silent", "--accept-package-agreements", "--accept-source-agreements")
            & winget @installArgs
            if ($LASTEXITCODE -eq 0) {
                Write-Success "$Name installed via winget"
                return $true
            }
        } catch {
            Write-Warning "winget install failed: $_"
        }
    }
    
    # Fallback to scoop
    if ($ScoopPackage -and (Test-CommandExists "scoop")) {
        try {
            & scoop install $ScoopPackage
            if ($LASTEXITCODE -eq 0) {
                Write-Success "$Name installed via scoop"
                return $true
            }
        } catch {
            Write-Warning "scoop install failed: $_"
        }
    }
    
    Add-Issue $Name "Automatic install failed" "Install manually or ensure winget/scoop is available"
    return $false
}

function Update-SessionPath {
    param([string]$PathToAdd)
    
    if ($env:PATH -notlike "*$PathToAdd*") {
        $env:PATH = "$PathToAdd;$env:PATH"
        Write-Log "Added $PathToAdd to session PATH"
    }
    
    if ($PersistPath -and -not $Doctor) {
        Write-Log "Persisting PATH change to user environment..."
        try {
            $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
            if ($userPath -notlike "*$PathToAdd*") {
                [Environment]::SetEnvironmentVariable("Path", "$PathToAdd;$userPath", "User")
                Write-Success "PATH persisted (restart terminal for system-wide effect)"
            }
        } catch {
            Write-Warning "Could not persist PATH (may require admin): $_"
        }
    }
}

# ============================================================================
# ENVIRONMENT CHECKS
# ============================================================================

Write-PhaseStart "CHECKING ENVIRONMENT"

# Docker
Write-Log "Checking Docker..."
if (Test-CommandExists "docker") {
    $dockerVersion = Get-ToolVersion "docker" "--version" "(\d+\.\d+\.\d+)"
    $script:ToolVersions["docker"] = $dockerVersion
    Write-Success "Docker found: $dockerVersion"
    
    # Check if Docker daemon is running
    try {
        $null = docker ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Docker daemon is running"

            # Check for conflicting kind clusters (especially Docker Desktop's default "desktop" cluster)
            Write-Log "Checking for conflicting kind clusters..."
            if (Test-CommandExists "kind") {
                try {
                    $existingClusters = & kind get clusters 2>&1 | Out-String
                    if ($existingClusters -match "desktop") {
                        Write-Warning "Found Docker Desktop's default 'desktop' kind cluster"
                        Write-Warning "This cluster can conflict with cs301-crm cluster creation (port 8443 conflict)"

                        if (-not $Doctor) {
                            Write-Log "Cleaning up 'desktop' kind cluster to prevent port conflicts..."
                            try {
                                & kind delete cluster --name desktop 2>&1 | Out-Null
                                if ($LASTEXITCODE -eq 0) {
                                    Write-Success "Removed conflicting 'desktop' kind cluster"
                                } else {
                                    Write-Warning "Could not remove 'desktop' cluster (may need to do manually)"
                                }
                            } catch {
                                Write-Warning "Could not remove 'desktop' cluster: $_"
                            }
                        } else {
                            Add-Issue "kind" "Conflicting 'desktop' cluster found" "Run: kind delete cluster --name desktop"
                        }
                    } else {
                        Write-Log "No conflicting kind clusters found"
                    }
                } catch {
                    Write-Log "Could not check for kind clusters (kind may not be installed yet)"
                }
            }
        } else {
            Add-Issue "Docker" "Docker daemon not running" "Start Docker Desktop"
        }
    } catch {
        Add-Issue "Docker" "Docker daemon not responding" "Start Docker Desktop"
    }
} else {
    Add-Issue "Docker" "Not found" "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
}

# Git
Write-Log "Checking Git..."
if (Test-CommandExists "git") {
    $gitVersion = Get-ToolVersion "git" "--version" "(\d+\.\d+\.\d+)"
    $script:ToolVersions["git"] = $gitVersion
    Write-Success "Git found: $gitVersion"
} else {
    Add-Issue "Git" "Not found" "Install Git from https://git-scm.com/downloads"
}

# Java
Write-Log "Checking Java..."
if (Test-CommandExists "java") {
    $javaVersion = Get-ToolVersion "java" "--version" "(\d+)\.(\d+)\.(\d+)"
    $javaMajor = $null
    try {
        $javaFullOutput = & java --version 2>&1 | Out-String
        if ($javaFullOutput -match "openjdk (\d+)") {
            $javaMajor = [int]$matches[1]
        }
    } catch {}
    
    $script:ToolVersions["java"] = $javaVersion
    Write-Success "Java found: $javaVersion (major: $javaMajor)"
    
    if ($javaMajor -and $javaMajor -lt 21) {
        Add-Issue "Java" "Version $javaMajor found, but Java 21 required" "Install Java 21 (Temurin) from https://adoptium.net/"
    }
} else {
    Add-Issue "Java" "Not found" "Install Java 21 (Temurin) from https://adoptium.net/ or use: winget install EclipseAdoptium.Temurin.21.JDK"
}

# Node.js
Write-Log "Checking Node.js..."
if (Test-CommandExists "node") {
    $nodeVersion = Get-ToolVersion "node" "--version" "(\d+\.\d+\.\d+)"
    $nodeMajor = $null
    if ($nodeVersion -match "^(\d+)\.") {
        $nodeMajor = [int]$matches[1]
    }
    
    $script:ToolVersions["node"] = $nodeVersion
    Write-Success "Node.js found: $nodeVersion"
    
    if ($nodeMajor -and $nodeMajor -lt 18) {
        Add-Issue "Node.js" "Version $nodeVersion found, but >=18 recommended" "Install Node.js 18+ from https://nodejs.org/"
    }
} else {
    Add-Issue "Node.js" "Not found" "Install Node.js 18+ from https://nodejs.org/ or use: winget install OpenJS.NodeJS.LTS"
}

# npm (usually comes with Node)
if (Test-CommandExists "npm") {
    $npmVersion = Get-ToolVersion "npm" "--version"
    $script:ToolVersions["npm"] = $npmVersion
    Write-Success "npm found: $npmVersion"
} else {
    Add-Issue "npm" "Not found" "Usually bundled with Node.js"
}

# Make
Write-Log "Checking Make..."
if (Test-CommandExists "make") {
    $makeVersion = Get-ToolVersion "make" "--version" "(\d+\.\d+)"
    $script:ToolVersions["make"] = $makeVersion
    Write-Success "Make found: $makeVersion"
} else {
    # Check if Git Bash is installed (includes make)
    $gitBashMake = 'C:\Program Files\Git\usr\bin\make.exe'
    if (Test-Path $gitBashMake) {
        Write-Success "Make found via Git Bash: $gitBashMake"
        $env:PATH = 'C:\Program Files\Git\usr\bin;' + $env:PATH
    } else {
        Add-Issue "Make" "Not found" "Install via scoop (scoop install make) or ensure Git for Windows is installed with Unix tools"
    }
}

# Python (optional but recommended)
Write-Log "Checking Python..."
$pythonFound = $false
foreach ($pyCmd in @("python", "py", "python3")) {
    if (Test-CommandExists $pyCmd) {
        try {
            $null = & $pyCmd -c "pass" 2>&1
            if ($LASTEXITCODE -eq 0) {
                $pythonVersion = Get-ToolVersion $pyCmd "--version" "(\d+\.\d+\.\d+)"
                $script:ToolVersions["python"] = $pythonVersion
                Write-Success "Python found ($pyCmd): $pythonVersion"
                $pythonFound = $true
                break
            }
        } catch {}
    }
}

if (-not $pythonFound) {
    Write-Warning "Python not found (optional). Recommended for HTML report generation."
    Write-Warning "  Install: winget install Python.Python.3.12"
}

# ============================================================================
# CHECK FOR REQUIRED SYSTEM DEPENDENCIES
# ============================================================================

# Define required system dependencies (not including optional Python or portable CLI tools)
$requiredSystemDeps = @("Docker", "Git", "Java", "Node.js", "npm", "Make")

# Filter issues to only those related to required system dependencies
$systemDepIssues = $script:Issues | Where-Object { $requiredSystemDeps -contains $_.Tool }

if ($systemDepIssues.Count -gt 0) {
    Write-Log ""
    Write-Log "========================================"
    Write-Error "MISSING REQUIRED SYSTEM DEPENDENCIES"
    Write-Log "========================================"
    Write-Log ""
    Write-Log "The following required system dependencies are missing or have issues:"
    Write-Log ""

    foreach ($issue in $systemDepIssues) {
        Write-Log "  ❌ $($issue.Tool)"
        Write-Log "     Problem: $($issue.Message)"
        if ($issue.Fix) {
            Write-Log "     Fix: $($issue.Fix)"
        }
        Write-Log ""
    }

    Write-Log "========================================"
    Write-Log "INSTALLATION INSTRUCTIONS"
    Write-Log "========================================"
    Write-Log ""
    Write-Log "Please install all required system dependencies before running this setup script."
    Write-Log ""
    Write-Log "Quick install commands:"
    Write-Log ""
    Write-Log "  Docker Desktop:"
    Write-Log "    Download from: https://www.docker.com/products/docker-desktop/"
    Write-Log "    Or use: winget install Docker.DockerDesktop"
    Write-Log ""
    Write-Log "  Git:"
    Write-Log "    Download from: https://git-scm.com/downloads"
    Write-Log "    Or use: winget install Git.Git"
    Write-Log ""
    Write-Log "  Java 21 (Temurin):"
    Write-Log "    Download from: https://adoptium.net/"
    Write-Log "    Or use: winget install EclipseAdoptium.Temurin.21.JDK"
    Write-Log ""
    Write-Log "  Node.js (LTS):"
    Write-Log "    Download from: https://nodejs.org/"
    Write-Log "    Or use: winget install OpenJS.NodeJS.LTS"
    Write-Log ""
    Write-Log "  Make:"
    Write-Log "    Option 1: scoop install make"
    Write-Log "    Option 2: Install Git for Windows (includes make in Git Bash)"
    Write-Log ""
    Write-Log "After installing these dependencies, run this setup script again."
    Write-Log ""
    Write-Log "For detailed installation instructions, see:"
    Write-Log "  docs/onboarding/new-dev-setup.md"
    Write-Log ""

    Write-PhaseEnd "Environment Checks"

    $totalDuration = (Get-Date) - $script:SetupStartTime
    Write-Log ""
    Write-Log "Total time: $($totalDuration.ToString('mm\:ss'))"
    Write-Log ""
    Write-Error "Setup failed: Missing required system dependencies."
    Write-Log "Please install all required dependencies and try again."

    if (-not $Doctor) {
        Write-Log ""
        Write-Log "Full log: $LogFile"
    }

    exit 1
}

Write-PhaseEnd "Environment Checks"

# ============================================================================
# CLI TOOLS INSTALLATION
# ============================================================================

Write-PhaseStart "CLI TOOLS INSTALLATION"

if ($Portable) {
    if (-not (Test-Path $DevToolsBin)) {
        Write-Log "Creating .devtools/bin directory..."
        New-Item -ItemType Directory -Path $DevToolsBin -Force | Out-Null
    }

    # On Windows, remove non-.exe binaries from .devtools/bin that were left by
    # a previous run on another platform (e.g. setup.sh on Linux/WSL).
    # These shadow the real Windows executables and cause "not a valid Win32
    # application" errors.
    if ($env:OS -eq "Windows_NT" -and (Test-Path $DevToolsBin)) {
        $knownTools = @("kubectl", "helm", "kind", "kubeconform")
        foreach ($tool in $knownTools) {
            $staleFile = Join-Path $DevToolsBin $tool
            if ((Test-Path $staleFile) -and -not $staleFile.EndsWith(".exe")) {
                Write-Warning "Removing non-Windows binary from .devtools/bin: $tool (likely from a Linux/WSL setup run)"
                Remove-Item $staleFile -Force -ErrorAction SilentlyContinue
            }
        }
    }

    Update-SessionPath $DevToolsBin
}

# kubectl
Write-Log "Checking kubectl..."
if (Test-CommandExists "kubectl") {
    $kubectlVersion = Get-ToolVersion "kubectl" "version --client -o json" "(\d+\.\d+\.\d+)"
    if (-not $kubectlVersion) {
        $kubectlVersion = Get-ToolVersion "kubectl" "version --client --short" "(\d+\.\d+\.\d+)"
    }
    $script:ToolVersions["kubectl"] = $kubectlVersion
    Write-Success "kubectl found: $kubectlVersion"
    
    # If portable mode, ensure kubectl is also available in .devtools/bin for bash scripts
    if ($Portable -and $env:OS -eq "Windows_NT") {
        $portableKubectl = Join-Path $DevToolsBin "kubectl.exe"
        if (-not (Test-Path $portableKubectl)) {
            # Try to find the real binary (not Chocolatey shim)
            $globalKubectl = (Get-Command kubectl -ErrorAction SilentlyContinue).Source
            $chocoLibKubectl = "C:\ProgramData\chocolatey\lib\kubernetes-cli\tools\kubernetes\client\bin\kubectl.exe"
            if (Test-Path $chocoLibKubectl) {
                Write-Log "Copying kubectl from Chocolatey lib to .devtools/bin for Git Bash compatibility..."
                Copy-Item $chocoLibKubectl $portableKubectl -Force
            } elseif ($globalKubectl) {
                Write-Log "Copying kubectl to .devtools/bin for Git Bash compatibility..."
                Copy-Item $globalKubectl $portableKubectl -Force
            }
        }
    }
} else {
    if ($Portable) {
        $kubectlUrl = "https://dl.k8s.io/release/v1.31.0/bin/windows/amd64/kubectl.exe"
        Install-PortableTool -Name "kubectl" -Version "1.31.0" -Url $kubectlUrl -FileName "kubectl.exe"
    } else {
        Install-SystemTool -Name "kubectl" -WingetId "Kubernetes.kubectl" -ScoopPackage "kubectl"
    }
}

# helm
Write-Log "Checking helm..."
if (Test-CommandExists "helm") {
    $helmVersion = Get-ToolVersion "helm" "version --short" "v(\d+\.\d+\.\d+)"
    $script:ToolVersions["helm"] = $helmVersion
    Write-Success "helm found: $helmVersion"
    
    # If portable mode, ensure helm is also available in .devtools/bin for bash scripts
    if ($Portable -and $env:OS -eq "Windows_NT") {
        $portableHelm = Join-Path $DevToolsBin "helm.exe"
        if (-not (Test-Path $portableHelm)) {
            # Try to find the real binary from Chocolatey lib directory (not the shim)
            $chocoLibHelm = "C:\ProgramData\chocolatey\lib\kubernetes-helm\tools\windows-amd64\helm.exe"
            if (Test-Path $chocoLibHelm) {
                Write-Log "Copying helm from Chocolatey lib to .devtools/bin for Git Bash compatibility..."
                Copy-Item $chocoLibHelm $portableHelm -Force
            } else {
                $globalHelm = (Get-Command helm -ErrorAction SilentlyContinue).Source
                if ($globalHelm) {
                    Write-Log "Copying helm to .devtools/bin for Git Bash compatibility..."
                    Copy-Item $globalHelm $portableHelm -Force
                }
            }
        }
    }
} else {
    if ($Portable) {
        $helmUrl = "https://get.helm.sh/helm-v3.17.0-windows-amd64.zip"
        Install-PortableTool -Name "helm" -Version "3.17.0" -Url $helmUrl -FileName "helm.exe" -ExtractPattern "helm.exe"
    } else {
        Install-SystemTool -Name "helm" -WingetId "Helm.Helm" -ScoopPackage "helm"
    }
}

# kind
Write-Log "Checking kind..."
if (Test-CommandExists "kind") {
    $kindVersion = Get-ToolVersion "kind" "version" "v(\d+\.\d+\.\d+)"
    $script:ToolVersions["kind"] = $kindVersion
    Write-Success "kind found: $kindVersion"
    
    # If portable mode, ensure kind is also available in .devtools/bin for bash scripts
    if ($Portable -and $env:OS -eq "Windows_NT") {
        $portableKind = Join-Path $DevToolsBin "kind.exe"
        if (-not (Test-Path $portableKind)) {
            # Try to find the real binary from Chocolatey lib directory (not the shim)
            $chocoLibKind = "C:\ProgramData\chocolatey\lib\kind\kind.exe"
            if (Test-Path $chocoLibKind) {
                Write-Log "Copying kind from Chocolatey lib to .devtools/bin for Git Bash compatibility..."
                Copy-Item $chocoLibKind $portableKind -Force
            } else {
                $globalKind = (Get-Command kind -ErrorAction SilentlyContinue).Source
                if ($globalKind) {
                    Write-Log "Copying kind to .devtools/bin for Git Bash compatibility..."
                    Copy-Item $globalKind $portableKind -Force
                }
            }
        }
    }
} else {
    if ($Portable) {
        $kindUrl = "https://kind.sigs.k8s.io/dl/v0.26.0/kind-windows-amd64"
        Install-PortableTool -Name "kind" -Version "0.26.0" -Url $kindUrl -FileName "kind.exe"
    } else {
        Install-SystemTool -Name "kind" -ScoopPackage "kind"
    }
}

# kubeconform
Write-Log "Checking kubeconform..."
if (Test-CommandExists "kubeconform") {
    $kubeconformVersion = Get-ToolVersion "kubeconform" "-v" "v?(\d+\.\d+\.\d+)"
    $script:ToolVersions["kubeconform"] = $kubeconformVersion
    Write-Success "kubeconform found: $kubeconformVersion"
} else {
    if ($Portable) {
        $kubeconformUrl = "https://github.com/yannh/kubeconform/releases/download/v0.6.7/kubeconform-windows-amd64.zip"
        Install-PortableTool -Name "kubeconform" -Version "0.6.7" -Url $kubeconformUrl -FileName "kubeconform.exe" -ExtractPattern "kubeconform.exe"
    } else {
        Install-SystemTool -Name "kubeconform" -ScoopPackage "kubeconform"
    }
}

# ============================================================================
# ENVIRONMENT CONFIGURATION
# ============================================================================
Write-PhaseEnd "CLI Tools Installation"

# ============================================================================
# ENVIRONMENT CONFIGURATION
# ============================================================================

if (-not $Doctor -and -not $VerifyOnly) {
    Write-PhaseStart "ENVIRONMENT CONFIGURATION"
    
    # Create .env files from .env.example templates
    $envExamples = Get-ChildItem -Path $RepoRoot -Recurse -Filter ".env.example" -File
    foreach ($envExample in $envExamples) {
        $envFile = Join-Path $envExample.DirectoryName ".env"
        if (-not (Test-Path $envFile)) {
            Write-Log "Creating .env from template: $($envExample.DirectoryName)"
            Copy-Item $envExample.FullName $envFile
            Write-Success "Created $envFile (review and update placeholders)"
        } else {
            Write-Log ".env already exists: $($envExample.DirectoryName)"
        }
    }
    
    # Initialize Frontend Dependencies
    Write-Log ""
    Write-Log "Initializing frontend dependencies..."
    $frontendDir = Join-Path $RepoRoot "services\frontend\crm-ui"
    if (Test-Path $frontendDir) {
        Push-Location $frontendDir
        try {
            if (Test-Path "package.json") {
                Write-Log "Running npm ci in crm-ui..."
                & npm ci
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Frontend dependencies installed"
                } else {
                    Write-Warning "npm ci had warnings or errors"
                }
            }
        } catch {
            Write-Error "Frontend dependency installation failed: $_"
        } finally {
            Pop-Location
        }
    }
    
    # Initialize Backend Dependencies (Gradle downloads handled by wrapper)
    Write-Log ""
    Write-Log "Verifying backend Gradle wrappers..."
    $backendServices = @("agent", "client", "transaction")
    foreach ($service in $backendServices) {
        $serviceDir = Join-Path $RepoRoot "services\backend\$service"
        if (Test-Path $serviceDir) {
            $gradlewBat = Join-Path $serviceDir "gradlew.bat"
            if (Test-Path $gradlewBat) {
                Write-Success "$service : Gradle wrapper present"
            } else {
                Write-Warning "$service : Gradle wrapper missing"
            }
        }
    }
    
    # Initialize Python Dependencies for log service
    Write-Log ""
    Write-Log "Checking Python log service..."
    $logServiceDir = Join-Path $RepoRoot "services\backend\log"
    if (Test-Path $logServiceDir) {
        $requirementsTxt = Join-Path $logServiceDir "requirements.txt"
        $venvDir = Join-Path $logServiceDir "venv"
        
        if (Test-Path $requirementsTxt) {
            if ($pythonFound) {
                Write-Log "Python log service uses requirements.txt"
                Write-Log "  To set up venv manually: cd services\backend\log; python -m venv venv; venv\Scripts\activate; pip install -r requirements.txt"
                
                # Optionally auto-create venv if it doesn't exist
                if (-not (Test-Path $venvDir)) {
                    Write-Log "Creating Python venv for log service..."
                    Push-Location $logServiceDir
                    try {
                        & python -m venv venv
                        if ($LASTEXITCODE -eq 0) {
                            & "venv\Scripts\pip.exe" install -r requirements.txt
                            if ($LASTEXITCODE -eq 0) {
                                Write-Success "Python log service venv created and dependencies installed"
                            } else {
                                Write-Warning "pip install failed"
                            }
                        }
                    } catch {
                        Write-Warning "Could not auto-create venv: $_"
                    } finally {
                        Pop-Location
                    }
                } else {
                    Write-Success "Python log service venv already exists"
                }
            } else {
                Write-Warning "Python not found; log service venv setup skipped"
            }
        }
    }
    
    Write-PhaseEnd "Environment Configuration"
}

# ============================================================================
# DOCTOR MODE SUMMARY
# ============================================================================

if ($Doctor) {
    Write-PhaseStart "DOCTOR SUMMARY"
    
    if ($script:Issues.Count -eq 0) {
        Write-Success "All checks passed! Environment is ready."
        Write-Log ""
        Write-Log "Next steps:"
        Write-Log "  1. Run this script without --doctor to ensure all dependencies are initialized"
        Write-Log "  2. Run: .\scripts\dev-setup\setup.ps1 -VerifyOnly"
        Write-Log "  3. Start contributing!"
    } else {
        Write-Log "Found $($script:Issues.Count) issue(s):"
        Write-Log ""
        foreach ($issue in $script:Issues) {
            Write-Log "  ❌ $($issue.Tool)"
            Write-Log "     Problem: $($issue.Message)"
            if ($issue.Fix) {
                Write-Log "     Fix: $($issue.Fix)"
            }
            Write-Log ""
        }
        
        Write-Log "To fix these issues:"
        Write-Log "  1. Address the issues above manually, OR"
        Write-Log "  2. Run: .\scripts\dev-setup\setup.ps1 (for portable install)"
        Write-Log "  3. Run: .\scripts\dev-setup\setup.ps1 -System (for system-wide install)"
    }
    
    Write-PhaseEnd "Doctor Mode"
    
    $totalDuration = (Get-Date) - $script:SetupStartTime
    Write-Log ""
    Write-Log "Total time: $($totalDuration.ToString('mm\:ss'))"
    
    exit $(if ($script:Issues.Count -eq 0) { 0 } else { 1 })
}

# ============================================================================
# VERIFICATION SEQUENCE
# ============================================================================

if (-not $SkipVerify) {
    $verificationResults = @{}
    Write-PhaseStart "VERIFICATION SEQUENCE"
    
    if ($Deploy) {
        # When -Deploy is specified, just run test-and-spinup-all which does:
        # 1. Full test pipeline (backend + frontend)
        # 2. K8s validation
        # 3. K8s deployment
        Write-Log "Running complete test and deployment pipeline (test-and-spinup-all)..."
        Write-Log ""
        $stepStart = Get-Date
        $deployScript = Join-Path $RepoRoot "scripts\test-and-spinup-all\test-and-spinup-all.ps1"
        if (Test-Path $deployScript) {
            try {
                & $deployScript
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Test and deployment pipeline failed (exit code: $LASTEXITCODE)"
                    $verificationResults["deploy"] = "FAIL"
                } else {
                    $stepDuration = (Get-Date) - $stepStart
                    Write-Success "Test and deployment pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                    $verificationResults["deploy"] = "PASS"
                }
            } catch {
                Write-Error "Test and deployment pipeline error: $_"
                $verificationResults["deploy"] = "FAIL"
            }
        } else {
            Write-Warning "Deploy script not found: $deployScript"
            $verificationResults["deploy"] = "SKIP"
        }
    } elseif ($DeployOnly) {
        # When -DeployOnly is specified, run only the k8s deployment pipeline
        # (no backend/frontend tests). Useful for iterating on k8s issues.
        Write-Log "Running deploy-only pipeline (build-and-deploy-k8s-local)..."
        Write-Log ""
        $stepStart = Get-Date
        $deployOnlyScript = Join-Path $RepoRoot "scripts\build-and-deploy-k8s\build-and-deploy-k8s-local.ps1"
        if (Test-Path $deployOnlyScript) {
            try {
                & $deployOnlyScript
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Deploy-only pipeline failed (exit code: $LASTEXITCODE)"
                    $verificationResults["deploy"] = "FAIL"
                } else {
                    $stepDuration = (Get-Date) - $stepStart
                    Write-Success "Deploy-only pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                    $verificationResults["deploy"] = "PASS"
                }
            } catch {
                Write-Error "Deploy-only pipeline error: $_"
                $verificationResults["deploy"] = "FAIL"
            }
        } else {
            Write-Warning "Deploy-only script not found: $deployOnlyScript"
            $verificationResults["deploy"] = "SKIP"
        }
    } else {
        # Without -Deploy, run validation and tests only (no deployment)
        
        # Step 1: K8s manifest validation
        Write-Log "Step 1: Running k8s manifest validation (make k8s-validate)..."
        $stepStart = Get-Date
        try {
            Push-Location $RepoRoot
            # Ensure bash can find portable tools by explicitly setting PATH in the subprocess
            $env:PATH = "$DevToolsBin;$env:PATH"
            $output = & make k8s-validate 2>&1
            $exitCode = $LASTEXITCODE
            $output | ForEach-Object { Write-Log $_ }
            
            if ($exitCode -ne 0) {
                Write-Error "k8s validation failed (exit code: $exitCode)"
                $verificationResults["k8s-validate"] = "FAIL"
            } else {
                $stepDuration = (Get-Date) - $stepStart
                Write-Success "k8s validation passed (took $($stepDuration.ToString('mm\:ss')))"
                $verificationResults["k8s-validate"] = "PASS"
            }
        } catch {
            Write-Error "k8s validation error: $_"
            $verificationResults["k8s-validate"] = "FAIL"
        } finally {
            Pop-Location
        }
        
        # Step 2: Backend pipeline (run even if Step 1 failed)
        Write-Log ""
        Write-Log "Step 2: Running backend test pipeline..."
        $stepStart = Get-Date
        $backendScript = Join-Path $RepoRoot "scripts\build-and-test-backend\build-and-test-backend.ps1"
        if (Test-Path $backendScript) {
            try {
                & $backendScript
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Backend pipeline failed (exit code: $LASTEXITCODE)"
                    $verificationResults["backend"] = "FAIL"
                } else {
                    $stepDuration = (Get-Date) - $stepStart
                    Write-Success "Backend pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                    $verificationResults["backend"] = "PASS"
                }
            } catch {
                Write-Error "Backend pipeline error: $_"
                $verificationResults["backend"] = "FAIL"
            }
        } else {
            Write-Warning "Backend pipeline script not found: $backendScript"
            $verificationResults["backend"] = "SKIP"
        }
        
        # Step 3: Frontend pipeline (run even if previous steps failed)
        Write-Log ""
        Write-Log "Step 3: Running frontend test pipeline..."
        $stepStart = Get-Date
        $frontendScript = Join-Path $RepoRoot "scripts\build-and-test-frontend\build-and-test-frontend.ps1"
        if (Test-Path $frontendScript) {
            try {
                & $frontendScript
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Frontend pipeline failed (exit code: $LASTEXITCODE)"
                    $verificationResults["frontend"] = "FAIL"
                } else {
                    $stepDuration = (Get-Date) - $stepStart
                    Write-Success "Frontend pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                    $verificationResults["frontend"] = "PASS"
                }
            } catch {
                Write-Error "Frontend pipeline error: $_"
                $verificationResults["frontend"] = "FAIL"
            }
        } else {
            Write-Warning "Frontend pipeline script not found: $frontendScript"
            $verificationResults["frontend"] = "SKIP"
        }
    }
    
    Write-PhaseEnd "Verification"
    
    # Verification summary
    Write-Log ""
    Write-PhaseStart "VERIFICATION SUMMARY"
    Write-Log ""
    Write-Log "========================================"
    Write-Log "VERIFICATION SUMMARY"
    Write-Log "========================================"
    Write-Log ""
    
    # Display results table
    $hasFailures = $false
    foreach ($step in @("k8s-validate", "backend", "frontend", "deploy")) {
        if ($verificationResults.ContainsKey($step)) {
            $result = $verificationResults[$step]
            if ($result -eq "FAIL") {
                $hasFailures = $true
            }
            Write-Log ("  {0,-20} : {1}" -f $step, $result)
        }
    }
    Write-Log ""
    
    if ($hasFailures) {
        Write-Error "Verification completed with failures!"
        Write-Log ""
        Write-Log "Troubleshooting:"
        Write-Log "  - Check build logs in: build-logs/"
        Write-Log "  - For k8s issues: kubectl get pods -A"
        Write-Log "  - For k8s events: kubectl get events -A --sort-by=.metadata.creationTimestamp"
        Write-PhaseEnd "Verification Summary"
        
        $totalDuration = (Get-Date) - $script:SetupStartTime
        Write-Log ""
        Write-Log "Total time: $($totalDuration.ToString('mm\:ss'))"
        
        exit 1
    } else {
        Write-Success "All verification checks passed!"
        Write-PhaseEnd "Verification Summary"
    }
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================

Write-Log ""
Write-PhaseStart "SETUP COMPLETE========================================"
Write-Log "SETUP COMPLETE"
Write-Log "========================================"
Write-Log ""
Write-Log "Detected tool versions:"
foreach ($tool in $script:ToolVersions.Keys | Sort-Object) {
    Write-Log ("  {0,-15} : {1}" -f $tool, $script:ToolVersions[$tool])
}
Write-Log ""

if ($Portable -and -not $PersistPath) {
    Write-Log "NOTE: Portable tools installed to .devtools/bin"
    Write-Log "      PATH updated for current session only"
    Write-Log "      To persist PATH changes, run with --persist-path flag"
    Write-Log ""
}

Write-Log "Available commands:"
Write-Log "  .\scripts\build-and-test-all.cmd           - Test all services"
Write-Log "  .\scripts\build-and-test-backend.cmd       - Test backend only"
Write-Log "  .\scripts\build-and-test-frontend.cmd      - Test frontend only"
Write-Log "  make k8s-validate                           - Validate K8s manifests"
Write-Log "  .\scripts\test-and-spinup-all.cmd          - Test + deploy to kind"
Write-Log "  .\scripts\build-and-deploy-k8s-local.cmd   - Deploy only to kind"
Write-Log ""
Write-Log "Documentation:"
Write-Log "  README.md"
Write-Log "  docs/onboarding/new-dev-setup.md"
Write-Log "  docs/local-k8s-dev.md"
Write-PhaseEnd "Setup Complete"

# Calculate and display total duration
$totalDuration = (Get-Date) - $script:SetupStartTime
Write-Log ""
Write-Log "========================================"
Write-Log "TIMING SUMMARY"
Write-Log "========================================"
Write-Log "Started:  $($script:SetupStartTime.ToString('HH:mm:ss'))"
Write-Log "Finished: $((Get-Date).ToString('HH:mm:ss'))"
Write-Log "Total Duration: $($totalDuration.ToString('mm')) minutes $($totalDuration.ToString('ss')) seconds"
Write-Log "========================================"

Write-Log "  docs/coding-standards/coding-standards.md"
Write-Log ""

if (-not $Doctor) {
    Write-Log "Full log: $LogFile"
}

Write-PhaseEnd "Setup Complete"

# Calculate and display total duration
$totalDuration = (Get-Date) - $script:SetupStartTime
Write-Log ""
Write-Log "========================================"
Write-Log "TIMING SUMMARY"
Write-Log "========================================"
Write-Log "Started:  $($script:SetupStartTime.ToString('HH:mm:ss'))"
Write-Log "Finished: $((Get-Date).ToString('HH:mm:ss'))"
Write-Log "Total Duration: $($totalDuration.ToString('mm')) minutes $($totalDuration.ToString('ss')) seconds"
Write-Log "========================================"

Write-Success "Developer environment ready!"

# ============================================================================
# LOG ROTATION
# ============================================================================

# Maintain only 3 most recent log files, sorted by name (inverse timestamp ensures latest first)
try {
    $logFiles = @(
        Get-ChildItem -Path $script:LogDir -File -Filter "*.log" -ErrorAction SilentlyContinue |
            Sort-Object Name
    )
    if ($logFiles.Count -gt 3) {
        $logFiles | Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
catch {
    # Best-effort only.
}

exit 0
