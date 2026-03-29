# scripts/dev/run-full-performance-suite.ps1
#
# Full Performance Testing Suite
# Runs all performance validation tests in sequence:
#   1. Frontend Latency Tests (Playwright)
#   2. JMeter Backend Performance Tests (100 concurrent threads)
#
# CS301 Requirements Validated:
#   - Frontend latency < 5 seconds
#   - Minimum 100 concurrent agents using client-service
#
# Prerequisites:
#   - Node.js & npm installed
#   - JMeter 5.6+ installed and in PATH
#   - Local dev stack running (.\scripts\dev\stack-up.ps1)
#
# Usage (from repo root):
#   .\scripts\dev\run-full-performance-suite.ps1

[CmdletBinding()]
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$OriginalErrorActionPreference = $ErrorActionPreference

# Color output functions
function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Error-Message {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Yellow
}

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Magenta
}

# Get script directory and repo root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BuildLogsDir = Join-Path $RepoRoot "build-logs\performance\full-suite\$Timestamp"

# Create build logs directory
New-Item -ItemType Directory -Path $BuildLogsDir -Force | Out-Null

Write-Section "Full Performance Testing Suite"
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "Output Directory: $BuildLogsDir" -ForegroundColor Gray
Write-Host ""

# Initialize result tracking
$TestResults = @{
    FrontendLatency = $null
    BackendPerformance = $null
    StartTime = Get-Date
}

# ============================================================================
# PHASE 1: FRONTEND LATENCY TESTS
# ============================================================================

if (-not $SkipFrontend) {
    Write-Section "Phase 1: Frontend Latency Tests"
    Write-Info "Testing CS301 requirement: Frontend latency < 5 seconds"
    Write-Info "Test type: Playwright E2E tests with mocked backend"
    Write-Host ""

    try {
        Write-Step "Navigating to frontend directory..."
        $FrontendDir = Join-Path $RepoRoot "services\frontend\crm-ui"
        Push-Location $FrontendDir

        Write-Step "Running: npm run test:e2e:latency"
        Write-Host ""

        # Run frontend latency tests
        $ErrorActionPreference = "Continue"
        npm run test:e2e:latency 2>&1 | Tee-Object -FilePath (Join-Path $BuildLogsDir "frontend-latency.log")
        $FrontendExitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"

        Pop-Location

        if ($FrontendExitCode -eq 0) {
            Write-Host ""
            Write-Success "Frontend latency tests PASSED"
            $TestResults.FrontendLatency = "PASS"
        } else {
            Write-Host ""
            Write-Error-Message "Frontend latency tests FAILED (exit code: $FrontendExitCode)"
            $TestResults.FrontendLatency = "FAIL"

            Write-Host ""
            Write-Info "Review test output: $BuildLogsDir\frontend-latency.log"
            Write-Info "Playwright HTML report: $FrontendDir\playwright-report\index.html"

            if (-not $SkipBackend) {
                Write-Host ""
                $Response = Read-Host "Continue with backend performance tests? (y/N)"
                if ($Response -ne "y" -and $Response -ne "Y") {
                    throw "Frontend latency tests failed. Aborting."
                }
            } else {
                throw "Frontend latency tests failed."
            }
        }

    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Error-Message $_.Exception.Message
        $TestResults.FrontendLatency = "ERROR"

        if (-not $SkipBackend) {
            Write-Host ""
            $Response = Read-Host "Continue with backend performance tests? (y/N)"
            if ($Response -ne "y" -and $Response -ne "Y") {
                throw "Frontend latency tests encountered an error. Aborting."
            }
        } else {
            throw
        }
    }
} else {
    Write-Info "Skipping frontend latency tests (--SkipFrontend flag)"
    $TestResults.FrontendLatency = "SKIPPED"
}

# ============================================================================
# PHASE 2: BACKEND PERFORMANCE TESTS (JMeter)
# ============================================================================

if (-not $SkipBackend) {
    Write-Section "Phase 2: Backend Performance Tests (JMeter)"
    Write-Info "Testing CS301 requirement: Minimum 100 concurrent agents"
    Write-Info "Test type: 100 concurrent threads, 10 loops each"
    Write-Info "Expected duration: ~2-4 minutes"
    Write-Host ""

    try {
        # Check if JMeter is installed
        Write-Step "Checking JMeter installation..."
        $JMeterCheck = Get-Command jmeter -ErrorAction SilentlyContinue
        if (-not $JMeterCheck) {
            throw "JMeter not found in PATH. Please install Apache JMeter 5.6+ from https://jmeter.apache.org/download_jmeter.cgi"
        }
        Write-Success "JMeter found: $($JMeterCheck.Source)"
        Write-Host ""

        # Check if local stack is running
        Write-Step "Verifying local dev stack is running..."
        try {
            $Response = Invoke-WebRequest -Uri "http://127.0.0.1:18088/actuator/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
            Write-Success "Local dev stack is running on http://127.0.0.1:18088"
        } catch {
            Write-Error-Message "Local dev stack is not responding on http://127.0.0.1:18088"
            Write-Info "Please start the stack first: .\scripts\dev\stack-up.ps1"
            throw "Dev stack health check failed"
        }
        Write-Host ""

        # Run JMeter test via bash script (handles cross-platform path conversion)
        Write-Step "Running JMeter performance test..."
        Write-Info "Delegating to: scripts\performance\run-100-threads.sh"
        Write-Host ""

        Push-Location $RepoRoot

        $ErrorActionPreference = "Continue"
        bash scripts/performance/run-100-threads.sh 2>&1 | Tee-Object -FilePath (Join-Path $BuildLogsDir "backend-performance.log")
        $JMeterExitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"

        Pop-Location

        if ($JMeterExitCode -eq 0) {
            Write-Host ""
            Write-Success "Backend performance tests PASSED"
            $TestResults.BackendPerformance = "PASS"
        } else {
            Write-Host ""
            Write-Error-Message "Backend performance tests FAILED (exit code: $JMeterExitCode)"
            $TestResults.BackendPerformance = "FAIL"

            Write-Host ""
            Write-Info "Review test output: $BuildLogsDir\backend-performance.log"

            # Find the latest JMeter report directory
            $JMeterOutputDir = Join-Path $RepoRoot "build-logs\performance\100-threads-local"
            if (Test-Path $JMeterOutputDir) {
                $LatestReport = Get-ChildItem -Path $JMeterOutputDir -Directory |
                    Sort-Object LastWriteTime -Descending |
                    Select-Object -First 1
                if ($LatestReport) {
                    Write-Info "JMeter HTML report: $($LatestReport.FullName)\report\index.html"
                }
            }

            throw "Backend performance tests failed."
        }

    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Error-Message $_.Exception.Message
        $TestResults.BackendPerformance = "ERROR"
        throw
    }
} else {
    Write-Info "Skipping backend performance tests (--SkipBackend flag)"
    $TestResults.BackendPerformance = "SKIPPED"
}

# ============================================================================
# SUMMARY REPORT
# ============================================================================

$TestResults.EndTime = Get-Date
$TestResults.Duration = $TestResults.EndTime - $TestResults.StartTime

Write-Section "Performance Testing Suite - Summary"

Write-Host "Execution Time: $($TestResults.Duration.ToString('hh\:mm\:ss'))" -ForegroundColor Gray
Write-Host "Results Directory: $BuildLogsDir" -ForegroundColor Gray
Write-Host ""

# Display results table
Write-Host "Test Results:" -ForegroundColor Cyan
Write-Host "  1. Frontend Latency Tests:     " -NoNewline
switch ($TestResults.FrontendLatency) {
    "PASS"    { Write-Host "PASS" -ForegroundColor Green }
    "FAIL"    { Write-Host "FAIL" -ForegroundColor Red }
    "ERROR"   { Write-Host "ERROR" -ForegroundColor Red }
    "SKIPPED" { Write-Host "SKIPPED" -ForegroundColor Yellow }
}

Write-Host "  2. Backend Performance Tests:  " -NoNewline
switch ($TestResults.BackendPerformance) {
    "PASS"    { Write-Host "PASS" -ForegroundColor Green }
    "FAIL"    { Write-Host "FAIL" -ForegroundColor Red }
    "ERROR"   { Write-Host "ERROR" -ForegroundColor Red }
    "SKIPPED" { Write-Host "SKIPPED" -ForegroundColor Yellow }
}

Write-Host ""

# Overall status
$AllPassed = ($TestResults.FrontendLatency -in @("PASS", "SKIPPED")) -and
             ($TestResults.BackendPerformance -in @("PASS", "SKIPPED"))

if ($AllPassed) {
    Write-Success "All performance tests PASSED!"
    Write-Host ""
    Write-Host "CS301 Requirements Validated:" -ForegroundColor Green
    Write-Host "  - Frontend latency < 5 seconds" -ForegroundColor Green
    Write-Host "  - Minimum 100 concurrent agents" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Error-Message "Performance testing suite encountered failures."
    Write-Host ""
    Write-Info "Review logs in: $BuildLogsDir"
    Write-Host ""
    exit 1
}
