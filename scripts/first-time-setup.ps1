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
  1. Runs environment doctor check
  2. Checks system dependencies (Docker, Git, Java, Node.js, etc.)
  3. Installs CLI tools (kubectl, helm, kind)
  4. Deploys to Kubernetes with VERBOSE mode enabled
  5. Generates comprehensive HTML report
  6. On failure: auto-generates support bundle for debugging

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

function Invoke-SupportBundle {
    Write-TracedLog "Generating support bundle for debugging..." "WARNING"
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    python scripts/pipelines/support_bundle.py 2>&1 | ForEach-Object {
        $_ | Tee-Object -FilePath $LogFile -Append
        Write-Host $_
    }
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -eq 0) {
        Write-TracedLog "Support bundle generated - share the zip file with the team" "INFO"
    } else {
        Write-TracedLog "Support bundle generation failed (non-critical)" "WARNING"
    }
}

function Invoke-OnFailure {
    Write-TracedLog "Setup failed! Collecting diagnostics..." "ERROR"
    Invoke-SupportBundle
    Write-TracedLog "Check log file: $LogFile" "ERROR"
    Write-TracedLog "Re-run after fixing issues: .\scripts\first-time-setup.ps1" "INFO"
}

Write-TracedLog "========================================" "INFO"
Write-TracedLog "FIRST-TIME SETUP WITH TRACING ENABLED" "INFO"
Write-TracedLog "========================================" "INFO"
Write-TracedLog "Log file: $LogFile" "INFO"
Write-TracedLog "" "INFO"

# Step 1: Doctor Check
Write-TracedLog "Step 1/5: Running environment doctor check..." "INFO"

$prevErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

python scripts/pipelines/doctor.py 2>&1 | ForEach-Object {
    $_ | Tee-Object -FilePath $LogFile -Append
    Write-Host $_
}
$doctorExitCode = $LASTEXITCODE

$ErrorActionPreference = $prevErrorActionPreference

if ($doctorExitCode -eq 0) {
    Write-TracedLog "Doctor check passed!" "SUCCESS"
} else {
    Write-TracedLog "Doctor check found issues (see above)" "WARNING"
    Write-TracedLog "Continuing with setup - some issues may be auto-resolved..." "INFO"
}

# Step 2: Setup Dependencies
Write-TracedLog "" "INFO"
Write-TracedLog "Step 2/5: Setting up development environment..." "INFO"
Write-TracedLog "This will check dependencies and install missing CLI tools..." "INFO"

# Temporarily allow errors to be non-terminating for Python output capture
$prevErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

python scripts/pipelines/setup_dev_env.py 2>&1 | ForEach-Object {
    $_ | Tee-Object -FilePath $LogFile -Append
    Write-Host $_
}
$setupExitCode = $LASTEXITCODE

# Restore previous error action preference
$ErrorActionPreference = $prevErrorActionPreference

if ($setupExitCode -eq 0) {
    Write-TracedLog "Environment setup complete!" "SUCCESS"
} else {
    Write-TracedLog "Environment setup failed with exit code $setupExitCode" "ERROR"
    Invoke-OnFailure
    exit 1
}

if ($SkipDeploy) {
    Write-TracedLog "" "INFO"
    Write-TracedLog "Skipping deployment (-SkipDeploy specified)" "WARNING"
    Write-TracedLog "Setup complete! Logs saved to: $LogFile" "SUCCESS"
    exit 0
}

# Step 3: Deploy with Verbose Mode
Write-TracedLog "" "INFO"
Write-TracedLog "Step 3/5: Deploying to Kubernetes (VERBOSE mode)..." "INFO"
Write-TracedLog "This may take 10-15 minutes on first run..." "INFO"
Write-TracedLog "" "INFO"

# Temporarily allow errors to be non-terminating for Python output capture
$ErrorActionPreference = "Continue"

# Use Python pipeline instead of direct make call (handles Windows make properly)
python scripts/pipelines/deploy_k8s.py --verbose 2>&1 | ForEach-Object {
    $_ | Tee-Object -FilePath $LogFile -Append
    Write-Host $_
}
$deployExitCode = $LASTEXITCODE

# Restore error action preference
$ErrorActionPreference = "Stop"

if ($deployExitCode -eq 0) {
    Write-TracedLog "" "INFO"
    Write-TracedLog "Deployment successful!" "SUCCESS"
} else {
    Write-TracedLog "Deployment failed with exit code $deployExitCode" "ERROR"
    Invoke-OnFailure
    exit 1
}

# Step 4: Generate Summary
Write-TracedLog "" "INFO"
Write-TracedLog "Step 4/5: Generating deployment report..." "INFO"

if (Test-Path "build-logs/build-and-deploy-k8s/deployment-report.html") {
    Write-TracedLog "HTML report: build-logs/build-and-deploy-k8s/deployment-report.html" "SUCCESS"
}

# Step 5: Final Status
Write-TracedLog "" "INFO"
Write-TracedLog "Step 5/5: Final status" "INFO"
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
Write-TracedLog "  python scripts/pipelines/doctor.py      # Check environment health" "INFO"
Write-TracedLog "  kubectl get pods -A                      # View all pods" "INFO"
Write-TracedLog "  make smoke                               # Run health checks" "INFO"
Write-TracedLog "  kind delete cluster --name cs301-crm     # Clean up" "INFO"
Write-TracedLog "" "INFO"
