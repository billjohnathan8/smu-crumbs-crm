# first-time-setup.ps1
# First-time setup script with comprehensive tracing enabled
# This script is designed for new developers setting up the environment for the first time

param(
    [switch]$SkipDeploy,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
First-Time Setup Script with Full Tracing

This script sets up your local development environment with detailed
logging and progress tracking. Perfect for first-time setup!

Usage:
  .\scripts\first-time-setup.ps1          # Full setup + deployment
  .\scripts\first-time-setup.ps1 -SkipDeploy  # Setup only, no K8s deployment

What it does:
  1. Checks system dependencies (Docker, Git, Java, Node.js, etc.)
  2. Installs CLI tools (kubectl, helm, kind)
  3. Deploys to Kubernetes with VERBOSE mode enabled
  4. Generates comprehensive HTML report

Logs are saved to: build-logs/first-time-setup/
"@
    exit 0
}

$ErrorActionPreference = "Stop"

# Create log directory
$LogDir = "build-logs/first-time-setup"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = "$LogDir/setup-$Timestamp.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-TracedLog {
    param([string]$Message, [string]$Level = "INFO")

    $Color = switch ($Level) {
        "SUCCESS" { "Green" }
        "WARNING" { "Yellow" }
        "ERROR" { "Red" }
        default { "White" }
    }

    $Timestamp = Get-Date -Format "HH:mm:ss"
    $LogMessage = "[$Timestamp] [$Level] $Message"

    Write-Host $LogMessage -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $LogMessage
}

Write-TracedLog "========================================" "INFO"
Write-TracedLog "FIRST-TIME SETUP WITH TRACING ENABLED" "INFO"
Write-TracedLog "========================================" "INFO"
Write-TracedLog "Log file: $LogFile" "INFO"
Write-TracedLog "" "INFO"

# Step 1: Setup Dependencies
Write-TracedLog "Step 1/4: Setting up development environment..." "INFO"
Write-TracedLog "This will check dependencies and install missing CLI tools..." "INFO"
$setupExitCode = 0
python scripts/pipelines/setup_dev_env.py 2>&1 | Tee-Object -FilePath $LogFile -Append | Write-Host
$setupExitCode = $LASTEXITCODE

if ($setupExitCode -eq 0) {
    Write-TracedLog "Environment setup complete!" "SUCCESS"
} else {
    Write-TracedLog "Environment setup failed with exit code $setupExitCode" "ERROR"
    Write-TracedLog "Check log file: $LogFile" "ERROR"
    exit 1
}

if ($SkipDeploy) {
    Write-TracedLog "" "INFO"
    Write-TracedLog "Skipping deployment (-SkipDeploy specified)" "WARNING"
    Write-TracedLog "Setup complete! Logs saved to: $LogFile" "SUCCESS"
    exit 0
}

# Step 2: Deploy with Verbose Mode
Write-TracedLog "" "INFO"
Write-TracedLog "Step 2/4: Deploying to Kubernetes (VERBOSE mode)..." "INFO"
Write-TracedLog "This may take 10-15 minutes on first run..." "INFO"
Write-TracedLog "" "INFO"

try {
    # Run verbose Make target for detailed output
    Invoke-Expression "make build-and-deploy-local VERBOSE=1 2>&1" | Tee-Object -FilePath $LogFile -Append | Write-Host

    Write-TracedLog "" "INFO"
    Write-TracedLog "Deployment successful!" "SUCCESS"
} catch {
    Write-TracedLog "Deployment failed: $_" "ERROR"
    Write-TracedLog "Check logs: $LogFile" "ERROR"
    exit 1
}

# Step 3: Generate Summary
Write-TracedLog "" "INFO"
Write-TracedLog "Step 3/4: Generating deployment report..." "INFO"

if (Test-Path "build-logs/build-and-deploy-k8s/deployment-report.html") {
    Write-TracedLog "HTML report: build-logs/build-and-deploy-k8s/deployment-report.html" "SUCCESS"
}

# Step 4: Final Status
Write-TracedLog "" "INFO"
Write-TracedLog "========================================" "INFO"
Write-TracedLog "FIRST-TIME SETUP COMPLETE!" "SUCCESS"
Write-TracedLog "========================================" "INFO"
Write-TracedLog "" "INFO"
Write-TracedLog "Logs saved to: $LogFile" "INFO"
Write-TracedLog "" "INFO"
Write-TracedLog "Access your application at:" "INFO"
Write-TracedLog "  http://localhost/app" "INFO"
Write-TracedLog "" "INFO"
Write-TracedLog "Useful commands:" "INFO"
Write-TracedLog "  kubectl get pods -A          # View all pods" "INFO"
Write-TracedLog "  make smoke                   # Run health checks" "INFO"
Write-TracedLog "  kind delete cluster --name cs301-crm  # Clean up" "INFO"
Write-TracedLog "" "INFO"
