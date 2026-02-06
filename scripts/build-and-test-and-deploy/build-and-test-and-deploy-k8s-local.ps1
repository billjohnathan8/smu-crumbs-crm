Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

$scriptDir = Split-Path -Parent $PSCommandPath
$scriptsRoot = Split-Path -Parent $scriptDir
$testScript = Join-Path $scriptsRoot "build-and-test\\build-and-test-backend.ps1"
$deployScript = Join-Path $scriptsRoot "build-and-deploy\\build-and-deploy-k8s-local.ps1"

if (-not (Test-Path $testScript)) {
    Write-Error "Test script not found: $testScript"
    exit 1
}

if (-not (Test-Path $deployScript)) {
    Write-Error "Deploy script not found: $deployScript"
    exit 1
}

Write-Log "Running backend test pipeline."
& $testScript @args
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Log "Backend test pipeline failed with exit code $exitCode. Skipping k8s deploy."
    exit $exitCode
}

Write-Log "Running local k8s deploy."
& $deployScript @args
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Log "Local k8s deploy failed with exit code $exitCode."
    exit $exitCode
}

Write-Log "Done."
exit 0
