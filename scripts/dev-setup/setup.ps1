<#
.SYNOPSIS
    Developer environment setup script for CS301 ITSA CRM project.

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
    After verification, deploy to local kind cluster (runs test-and-spinup-all).

.PARAMETER Portable
    Install tools to .devtools/bin (DEFAULT). Avoids global installs where possible.

.PARAMETER System
    Install tools globally using package manager (winget/scoop on Windows).

.PARAMETER PersistPath
    Persist .devtools/bin in user PATH permanently. Without this, PATH is only modified for current session.

.EXAMPLE
    .\scripts\dev-setup\setup.ps1
    Default: portable install + verification (no deploy)

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 --doctor
    Check environment without making changes

.EXAMPLE
    .\scripts\dev-setup\setup.ps1 --system --deploy
    Global install + verification + deploy to kind

.LINK
    docs/onboarding/new-dev-setup.md
#>

[CmdletBinding()]
param(
    [switch]$Doctor,
    [switch]$SkipVerify,
    [switch]$VerifyOnly,
    [switch]$Deploy,
    [switch]$Portable = $true,
    [switch]$System,
    [switch]$PersistPath
)

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
$script:LogFile = Join-Path $LogDir ("setup_{0}.log" -f (Get-Date -Format "yyyy-MM-dd_HH-mm-ss"))

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

function Write-Success { Write-Log $args[0] "✓" }
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
        WriStarted at: $($script:SetupStartTime.ToString('yyyy-MM-dd HH:mm:ss'))"
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

Write-PhaseStart "DETECTED REQUIREMENTS
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

Write-Log "========================================"
Write-Log "DETECTED REQUIREMENTS"
Write-Log "========================================"
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
Write-Log "  - Python >= 3.7 (used for HTML report generation)"
Write-Log ""
Write-Log "Already in Repo (no install needed):"
Write-Log "  - Gradle Wrapper (./gradlew, ./gradlew.bat)"
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
PhaseEnd "Requirements Detection
# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
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
        $tempFile = Join-Path $env:TEMP "$Name-download"
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

Write-Log "========================================"
Write-PhaseStart "CHECKING ENVIRONMENT
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
    $gitBashMake = "C:\Program Files\Git\usr\bin\make.exe"
    if (Test-Path $gitBashMake) {
        Write-Success "Make found via Git Bash: $gitBashMake"
        $env:PATH = "C:\Program Files\Git\usr\bin;$env:PATH"
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
# CLI TOOLS INSTALLATION
Write-PhaseEnd "Environment Checks"

# ============================================================================
# CLI TOOLS INSTALLATION
# ============================================================================

Write-PhaseStart "CLI TOOLS INSTALLATION
    if (-not (Test-Path $DevToolsBin)) {
        Write-Log "Creating .devtools/bin directory..."
        New-Item -ItemType Directory -Path $DevToolsBin -Force | Out-Null
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
    Write-PhaseStart "ENVIRONMENT CONFIGURATIONse -Filter ".env.example" -File
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
                Write-Log "  To set up venv manually: cd services\backend\log && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt"
                
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
}

# ============================================================================
# DOCTOR MODE SUMMARY
    
    Write-PhaseEnd "Environment Configuration"
}

# ============================================================================
# DOCTOR MODE SUMMARY
# ============================================================================

if ($Doctor) {
    Write-PhaseStart "DOCTOR SUMMARY
        Write-Log "Next steps:"
        Write-Log "  1. Run this script without --doctor to ensure all dependencies are initialized"
        Write-Log "  2. Run: .\scripts\dev-setup\setup.ps1 --verify-only"
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
        Write-Log "  3. Run: .\scripts\dev-setup\setup.ps1 --system (for system-wide install)"
    }
    
    exit $(if ($script:Issues.Count -eq 0) { 0 } else { 1 })
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
    $stepStart = Get-Date
    Write-PhaseStart "VERIFICATION SEQUENCE"
    # Step 1: K8s manifest validation
    Write-Log "Step 1: Running k8s manifest validation (make k8s-validate)..."
    try {
        Push-Location $RepoRoot
        $output = & make k8s-validate 2>&1
        $exitCode = $LASTEXITCODE
        $output | ForEach-Object { Write-Log $_ }
        
        if ($exitCode -ne 0) {
            Write-Error "k8s validation failed (exit code: $exitCode)"
            $verificationFailed = $true
        } el$stepDuration = (Get-Date) - $stepStart
            Write-Success "k8s validation passed (took $($stepDuration.ToString('mm\:ss')))"
        }
    } catch {
        Write-Error "k8s validation error: $_"
        $verificationFailed = $true
    } finally {
        Pop-Location
    }
    
    # Step 2: Backend pipeline
    if (-not $verificationFailed) {
        Write-Log ""
        Write-Log "Step 2: Running backend test pipeline..."
        $stepStart = Get-Date
        Write-Log "Step 2: Running backend test pipeline..."
        $backendScript = Join-Path $RepoRoot "scripts\build-and-test-backend\build-and-test-backend.ps1"
        if (Test-Path $backendScript) {
            try {
                & $backendScript
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Backend pipeline failed (exit code: $LASTEXITCODE)"
                    $stepDuration = (Get-Date) - $stepStart
                    Write-Success "Backend pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                }
            } catch {
                Write-Error "Backend pipeline error: $_"
                $verificationFailed = $true
            }
        } else {
            Write-Warning "Backend pipeline script not found: $backendScript"
        }
    }
    
    # Step 3: Frontend pipeline
    if (-not $verificationFailed) {
        Write-Log ""
        Write-Log "Step 3: Running frontend test pipeline..."
        $stepStart = Get-Date
        Write-Log ""
        Write-Log "Step 3: Running frontend test pipeline..."
        $frontendScript = Join-Path $RepoRoot "scripts\build-and-test-frontend\build-and-test-frontend.ps1"
        if (Test-Path $frontendScript) {
            try {
                & $frontendScript
                if ($stepDuration = (Get-Date) - $stepStart
                    Write-Success "Frontend pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                }
            } catch {
                Write-Error "Frontend pipeline error: $_"
                $verificationFailed = $true
            }
        } else {
            Write-Warning "Frontend pipeline script not found: $frontendScript"
        }
    }
    
    # Step 4: Optional deploy
    if ($Deploy -and -not $verificationFailed) {
        Write-Log ""
        Write-Log "Step 4: Deploying to local kind cluster (test-and-spinup-all)..."
        $stepStart = Get-Date
    # Step 4: Optional deploy
    if ($Deploy -and -not $verificationFailed) {
        Write-Log ""
        Write-Log "Step 4: Deploying to local kind cluster (test-and-spinup-all)..."
        $deployScript = Join-Path $RepoRoot "scripts\test-and-spinup-all\test-and-spinup-all.ps1"
        if (Test-Path $deployScript) {
            try {
                & $deployScript
                if ($stepDuration = (Get-Date) - $stepStart
                    Write-Success "Deploy pipeline passed (took $($stepDuration.ToString('mm\:ss')))"
                }
            } catch {
                Write-Error "Deploy pipeline error: $_"
                $verificationFailed = $true
            }
        } else {
            Write-Warning "Deploy script not found: $deployScript"
        }
    }
    
    Write-PhaseEnd "Verification"
    
    # Verification summary
    Write-Log ""
    Write-PhaseStart "VERIFICATION SUMMARY
    Write-Log ""
    Write-Log "========================================"
    Write-Log "VERIFICATION SUMMARY"
    Write-Log "========================================"
    
    if ($verificationFailed) {
        Write-Error "Verification failed!"
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

Write-Success "Developer environment ready! 🚀"
exit 0
