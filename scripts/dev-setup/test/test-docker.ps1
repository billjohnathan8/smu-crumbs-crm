<#
.SYNOPSIS
    Test the setup script in Docker containers (simulated fresh environments).

.DESCRIPTION
    Builds Docker test images and runs the setup script to verify:
    - Tool detection logic works correctly
    - Portable tool downloads work
    - Script handles missing dependencies gracefully
    
    LIMITATIONS: Cannot test Docker Desktop installation or kind cluster creation.
    For end-to-end testing, use a VM.

.PARAMETER Scenario
    Which test scenario to run:
    - fresh: Completely fresh Ubuntu (only curl/git)
    - partial: Ubuntu with some tools (Java, Node, Make)
    - all: Run all scenarios

.PARAMETER Mode
    Test mode:
    - doctor: Only run --doctor mode (default, safest)
    - install: Actually attempt portable tool installation
    - full: Run full setup (may take longer)

.PARAMETER ShowOutput
    Display the actual output from the container (verbose)

.EXAMPLE
    .\scripts\dev-setup\test\test-docker.ps1
    Run doctor mode on all scenarios (quick sanity check)

.EXAMPLE
    .\scripts\dev-setup\test\test-docker.ps1 -Scenario fresh -Mode install
    Test portable tool installation on fresh Ubuntu

.EXAMPLE
    .\scripts\dev-setup\test\test-docker.ps1 -ShowOutput
    Run tests and show actual container output
#>

[CmdletBinding()]
param(
    [ValidateSet("fresh", "partial", "all")]
    [string]$Scenario = "all",
    
    [ValidateSet("doctor", "install", "full")]
    [string]$Mode = "doctor",
    
    [switch]$ShowOutput
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Start overall timer
$script:TestStartTime = Get-Date

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$TestDir = $PSScriptRoot

Write-Host "========================================"
Write-Host "Docker-Based Setup Script Testing"
Write-Host "========================================"
Write-Host "Started at: $($script:TestStartTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "Repo root: $RepoRoot"
Write-Host "Test dir: $TestDir"
Write-Host "Scenario: $Scenario"
Write-Host "Mode: $Mode"
if ($ShowOutput) {
    Write-Host "Output: VERBOSE (showing container output)" -ForegroundColor Yellow
} else {
    Write-Host "Output: QUIET (use -ShowOutput to verify what's being tested)" -ForegroundColor Gray
}
Write-Host ""

# Build command based on mode
$setupCommand = switch ($Mode) {
    "doctor" { "bash scripts/dev-setup/setup.sh --doctor" }
    "install" { "bash scripts/dev-setup/setup.sh --skip-verify" }
    "full" { "bash scripts/dev-setup/setup.sh" }
}

function Test-Scenario {
    param(
        [string]$Name,
        [string]$Dockerfile
    )
    
    $scenarioStart = Get-Date
    
    Write-Host "========================================"
    Write-Host "Testing Scenario: $Name"
    Write-Host "========================================"
    
    $imageName = "setup-test-$Name"
    $dockerfilePath = Join-Path $TestDir $Dockerfile
    
    if (-not (Test-Path $dockerfilePath)) {
        Write-Warning "Dockerfile not found: $dockerfilePath"
        return $false
    }
    
    # Build the test image
    Write-Host "[1/3] Building Docker image: $imageName"
    Write-Host "Dockerfile: $Dockerfile"
    if (-not $ShowOutput) {
        Write-Host "      (Use -ShowOutput to see build details)" -ForegroundColor Gray
    }
    $buildStart = Get-Date
    
    try {
        if ($ShowOutput) {
            docker build -t $imageName -f $dockerfilePath $RepoRoot
        } else {
            $null = docker build -q -t $imageName -f $dockerfilePath $RepoRoot 2>&1
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker build failed for $Name"
            return $false
        }
        $buildDuration = (Get-Date) - $buildStart
        Write-Host "Build completed in $($buildDuration.ToString('mm\:ss'))" -ForegroundColor Cyan
    } catch {
        Write-Error "Docker build error: $_"
        return $false
    }
    
    Write-Host ""
    Write-Host "[2/3] Running setup script in container..."
    Write-Host "Command: $setupCommand"
    $runStart = Get-Date
    
    if (-not $ShowOutput) {
        Write-Host "      (Use -ShowOutput to see container output)" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Run the container with the repo mounted as volume
    try {
        if ($ShowOutput) {
            Write-Host "======== CONTAINER OUTPUT START ========" -ForegroundColor Cyan
            $output = & docker run --rm -v "${RepoRoot}:/home/developer/workspace" $imageName bash -c $setupCommand 2>&1
            $exitCode = $LASTEXITCODE
            $output | ForEach-Object { Write-Host $_ }
            Write-Host "======== CONTAINER OUTPUT END ==========" -ForegroundColor Cyan
        } else {
            $null = & docker run --rm -v "${RepoRoot}:/home/developer/workspace" $imageName bash -c $setupCommand 2>&1
            $exitCode = $LASTEXITCODE
        }
        $runDuration = (Get-Date) - $runStart
        
        Write-Host ""
        Write-Host "[3/3] Container exited with code: $exitCode"
        Write-Host "Container runtime: $($runDuration.ToString('mm\:ss'))" -ForegroundColor Cyan
        
        $scenarioDuration = (Get-Date) - $scenarioStart
        Write-Host "Total scenario time: $($scenarioDuration.ToString('mm\:ss'))" -ForegroundColor Cyan
        
        if ($Mode -eq "doctor" -and $exitCode -eq 1) {
            Write-Host "[OK] Expected: Doctor mode found missing tools (exit code 1)" -ForegroundColor Green
            return $true
        } elseif ($exitCode -eq 0) {
            Write-Host "[OK] Success: Setup completed (exit code 0)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[ERROR] Unexpected exit code: $exitCode" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Error "Docker run error: $_"
        return $false
    }
}

# Run tests
$results = @{}

if ($Scenario -eq "all" -or $Scenario -eq "fresh") {
    $results["fresh"] = Test-Scenario -Name "fresh" -Dockerfile "Dockerfile.ubuntu-fresh"
    Write-Host ""
}

if ($Scenario -eq "all" -or $Scenario -eq "partial") {
    $results["partial"] = Test-Scenario -Name "partial" -Dockerfile "Dockerfile.ubuntu-partial"
    Write-Host ""
}

# Summary
Write-Host "========================================"
Write-Host "TEST SUMMARY"
Write-Host "========================================"

$allPassed = $true
foreach ($key in $results.Keys) {
    if ($results[$key]) {
        Write-Host "[PASS] $key" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $key" -ForegroundColor Red
        $allPassed = $false
    }
}

Write-Host ""

# Calculate and display total duration
$totalDuration = (Get-Date) - $script:TestStartTime
Write-Host "========================================"
Write-Host "TIMING SUMMARY"
Write-Host "========================================"
Write-Host "Started:  $($script:TestStartTime.ToString('HH:mm:ss'))"
Write-Host "Finished: $((Get-Date).ToString('HH:mm:ss'))"
Write-Host "Total Duration: $($totalDuration.ToString('mm')) minutes $($totalDuration.ToString('ss')) seconds"
Write-Host "========================================"
Write-Host ""

if (-not $ShowOutput) {
    Write-Host "Note: Output was suppressed for speed." -ForegroundColor Yellow
    Write-Host "Run with -ShowOutput to verify what's actually being tested:" -ForegroundColor Yellow
    Write-Host "  .\\scripts\\dev-setup\\test\\test-docker.ps1 -ShowOutput" -ForegroundColor Cyan
    Write-Host ""
}

if ($allPassed) {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests failed!" -ForegroundColor Red
    exit 1
}
