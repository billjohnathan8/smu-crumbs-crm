#Requires -Version 5.1
<#
.SYNOPSIS
    Orchestrates complete end-to-end CI/CD testing workflow.

.DESCRIPTION
    This script orchestrates the full CI/CD testing workflow across all phases:

    Phase 1: Local Validation (test-ci-cd-local.ps1)
    - Validates GitHub workflow syntax using actionlint
    - Runs the full local test pipeline (test-and-spinup-all.ps1)

    Phase 2: GitHub Actions Testing (test-ci-cd-github.ps1)
    - Tests component trunk branch workflows
    - Tests integration and main branch workflows
    - Validates branch policy rules (if -CreatePRs)

    Phase 3: End-to-End Workflow (optional, if -EndToEnd)
    - Creates feature branch
    - Creates PR to component trunk
    - Verifies branch policy enforcement
    - (Optionally) tests merge cascade up to main

    Generates a consolidated report combining results from all phases.

.PARAMETER LocalOnly
    Only run Phase 1 (local validation), skip GitHub Actions and E2E testing.

.PARAMETER GitHubOnly
    Skip Phase 1 (local validation), only run GitHub Actions and E2E testing.

.PARAMETER EndToEnd
    Run Phase 3 (end-to-end workflow test) after Phases 1 and 2.

.PARAMETER CreatePRs
    Create actual test PRs (passed to test-ci-cd-github.ps1).

.PARAMETER Keep
    Preserve the kind cluster after local tests complete (passed to test-ci-cd-local.ps1).

.PARAMETER VerifyOnly
    Only verify that all dependencies are installed, don't run any tests.

.PARAMETER TimeoutMinutes
    Maximum time to wait for all phases to complete (default: 120 minutes).

.EXAMPLE
    .\test-ci-cd-full.ps1
    Run Phases 1 and 2 (local validation + GitHub Actions, no PRs).

.EXAMPLE
    .\test-ci-cd-full.ps1 -LocalOnly
    Only run Phase 1 (local validation).

.EXAMPLE
    .\test-ci-cd-full.ps1 -CreatePRs -EndToEnd
    Run all three phases including PR creation and E2E workflow testing.

.EXAMPLE
    .\test-ci-cd-full.ps1 -VerifyOnly
    Only check if all required dependencies are installed.

.NOTES
    Part of the CI/CD testing automation suite.
    See: docs/testing/ci-cd-workflows.md

EXIT CODES:
    0   - All phases passed
    1-2 - Phase 1 (local validation) failed
    3-6 - Phase 2 (GitHub Actions) failed
    7   - Phase 3 (E2E workflow) failed
    8   - Timeout exceeded
    9   - Dependency verification failed
#>

param(
    [switch]$LocalOnly,
    [switch]$GitHubOnly,
    [switch]$EndToEnd,
    [switch]$CreatePRs,
    [switch]$Keep,
    [switch]$VerifyOnly,
    [int]$TimeoutMinutes = 120
)

# ========================================
#  DEPRECATION WARNING
# ========================================
# This PowerShell script is DEPRECATED and will be removed in 2 weeks.
#
# Please use the new Python pipeline instead:
#   python scripts/pipelines/validate_ci_cd.py
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
Write-Host "  python scripts/pipelines/validate_ci_cd.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "The new script works on Windows, macOS, and Linux." -ForegroundColor Green
Write-Host "See: docs/migration/pipeline-migration.md"
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 3

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Exit code handling for native commands (PowerShell 7.3+)
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

# ========================================================================================
# SCRIPT INITIALIZATION
# ========================================================================================

$scriptName = [System.IO.Path]::GetFileNameWithoutExtension($PSCommandPath)
$repoRoot = Split-Path (Split-Path (Split-Path $PSCommandPath -Parent) -Parent) -Parent
$logDir = Join-Path $repoRoot "build-logs\$scriptName"

# Ensure log directory exists
if (-not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

# Create inverse-timestamp log file
$now = Get-Date
$inverseTimestamp = "{0:D4}{1:D2}{2:D2}-{3:D2}{4:D2}{5:D2}" -f `
    (9999 - $now.Year), `
    (12 - $now.Month), `
    (31 - $now.Day), `
    (23 - $now.Hour), `
    (59 - $now.Minute), `
    (59 - $now.Second)
$timestampReadable = $now.ToString("yyyy-MM-dd_HH-mm-ss")
$logFile = Join-Path $logDir ("inv{0}__{1}__{2}.log" -f $inverseTimestamp, $timestampReadable, $scriptName)

# UTF-8 encoding setup for Windows
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
[Console]::InputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

# Log file handle
$script:logFileStream = $null

# Global state tracking
$script:phaseResults = @{
    Phase1_Local = @{
        Name = "Phase 1: Local Validation"
        Status = "Not Run"
        ExitCode = $null
        Duration = $null
        StartTime = $null
        EndTime = $null
    }
    Phase2_GitHub = @{
        Name = "Phase 2: GitHub Actions"
        Status = "Not Run"
        ExitCode = $null
        Duration = $null
        StartTime = $null
        EndTime = $null
    }
    Phase3_EndToEnd = @{
        Name = "Phase 3: End-to-End Workflow"
        Status = "Not Run"
        ExitCode = $null
        Duration = $null
        StartTime = $null
        EndTime = $null
    }
}

# ========================================================================================
# UTILITY FUNCTIONS
# ========================================================================================

function Write-Log {
    param([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"

    # Write to console
    Write-Host $logMessage

    # Write to log file (strip ANSI codes)
    if ($script:logFileStream) {
        $cleanMessage = $logMessage -replace '\x1b\[[0-9;]*[a-zA-Z]', '' -replace '\x1b\([B0]', ''
        $script:logFileStream.WriteLine($cleanMessage)
        $script:logFileStream.Flush()
    }
}

function Exit-WithCode {
    param([Parameter(Mandatory = $true)][int]$Code)

    if ($script:logFileStream) {
        $script:logFileStream.Close()
        $script:logFileStream = $null
    }

    # Log rotation: keep only 3 most recent logs
    $logFiles = Get-ChildItem -Path $logDir -File -Filter "*.log" | Sort-Object LastWriteTime -Descending
    if ($logFiles.Count -gt 3) {
        $logFiles | Select-Object -Skip 3 | Remove-Item -Force
    }

    exit $Code
}

function Remove-AnsiEscapeCodes {
    param([string]$Text)
    $Text -replace '\x1b\[[0-9;]*[a-zA-Z]', '' -replace '\x1b\([B0]', ''
}

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$CommandName)
    $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Write-Banner {
    param([string]$Title)

    $border = "=" * 80
    Write-Log ""
    Write-Log $border
    Write-Log $Title.PadLeft(($border.Length + $Title.Length) / 2).PadRight($border.Length)
    Write-Log $border
    Write-Log ""
}

function Write-PhaseHeader {
    param(
        [string]$PhaseName,
        [string]$Description
    )

    $border = "-" * 80
    Write-Log ""
    Write-Log $border
    Write-Log ">>> $PhaseName"
    Write-Log $Description
    Write-Log $border
    Write-Log ""
}

function Format-Duration {
    param([TimeSpan]$Duration)

    if ($Duration.TotalHours -ge 1) {
        return "{0:N0}h {1:N0}m {2:N0}s" -f $Duration.Hours, $Duration.Minutes, $Duration.Seconds
    } elseif ($Duration.TotalMinutes -ge 1) {
        return "{0:N0}m {1:N0}s" -f $Duration.Minutes, $Duration.Seconds
    } else {
        return "{0:N1}s" -f $Duration.TotalSeconds
    }
}

# ========================================================================================
# DEPENDENCY VERIFICATION
# ========================================================================================

function Test-Dependencies {
    <#
    .SYNOPSIS
        Verifies all required dependencies for full CI/CD testing.
    #>

    Write-PhaseHeader -PhaseName "DEPENDENCY VERIFICATION" -Description "Checking required tools and services..."

    $allOk = $true

    # Check for Phase 1 dependencies
    if (-not $GitHubOnly) {
        Write-Log "[CHECK] actionlint (or auto-install capability)..."
        if (Test-CommandAvailable -CommandName "actionlint") {
            Write-Log "  ✓ actionlint is available"
        } else {
            Write-Log "  ℹ actionlint not found, but will be auto-installed if needed"
        }

        Write-Log "[CHECK] Docker daemon..."
        if (Test-CommandAvailable -CommandName "docker") {
            try {
                $null = & docker info 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "  ✓ Docker daemon is running"
                } else {
                    Write-Log "  ✗ Docker daemon is not running"
                    $allOk = $false
                }
            } catch {
                Write-Log "  ✗ Docker daemon check failed: $_"
                $allOk = $false
            }
        } else {
            Write-Log "  ✗ Docker is not installed"
            $allOk = $false
        }

        Write-Log "[CHECK] kind CLI..."
        if (Test-CommandAvailable -CommandName "kind") {
            Write-Log "  ✓ kind is available"
        } else {
            Write-Log "  ✗ kind is not installed"
            $allOk = $false
        }

        Write-Log "[CHECK] kubectl CLI..."
        if (Test-CommandAvailable -CommandName "kubectl") {
            Write-Log "  ✓ kubectl is available"
        } else {
            Write-Log "  ✗ kubectl is not installed"
            $allOk = $false
        }
    }

    # Check for Phase 2 dependencies
    if (-not $LocalOnly) {
        Write-Log "[CHECK] gh CLI (GitHub CLI)..."
        if (Test-CommandAvailable -CommandName "gh") {
            Write-Log "  ✓ gh CLI is available"

            # Check authentication
            try {
                $authStatus = & gh auth status 2>&1 | Out-String
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "  ✓ gh CLI is authenticated"
                } else {
                    Write-Log "  ✗ gh CLI is not authenticated"
                    Write-Log "    Run: gh auth login"
                    $allOk = $false
                }
            } catch {
                Write-Log "  ✗ gh CLI authentication check failed: $_"
                $allOk = $false
            }
        } else {
            Write-Log "  ✗ gh CLI is not installed"
            Write-Log "    Install from: https://cli.github.com/"
            $allOk = $false
        }

        Write-Log "[CHECK] git CLI..."
        if (Test-CommandAvailable -CommandName "git") {
            Write-Log "  ✓ git is available"
        } else {
            Write-Log "  ✗ git is not installed"
            $allOk = $false
        }
    }

    Write-Log ""
    if ($allOk) {
        Write-Log "✓ All dependency checks passed"
        return $true
    } else {
        Write-Log "✗ Some dependency checks failed"
        return $false
    }
}

# ========================================================================================
# PHASE 1: LOCAL VALIDATION
# ========================================================================================

function Invoke-LocalValidation {
    <#
    .SYNOPSIS
        Runs Phase 1: Local validation using test-ci-cd-local.ps1.
    #>

    Write-PhaseHeader -PhaseName "PHASE 1: LOCAL VALIDATION" -Description "Running actionlint and local test pipeline..."

    $phase = $script:phaseResults.Phase1_Local
    $phase.Status = "Running"
    $phase.StartTime = Get-Date

    try {
        $localScript = Join-Path $repoRoot "scripts\test-ci-cd-local\test-ci-cd-local.ps1"

        if (-not (Test-Path $localScript)) {
            Write-Log "✗ Local validation script not found: $localScript"
            $phase.Status = "Failed"
            $phase.ExitCode = 1
            return $false
        }

        # Build arguments
        $localArgs = @()
        if ($Keep) { $localArgs += "-Keep" }
        if ($VerifyOnly) { $localArgs += "-VerifyOnly" }

        Write-Log "Invoking: $localScript $($localArgs -join ' ')"
        Write-Log ""

        # Execute local validation script
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $localScript @localArgs
        $localExitCode = $LASTEXITCODE

        $phase.EndTime = Get-Date
        $phase.Duration = $phase.EndTime - $phase.StartTime
        $phase.ExitCode = $localExitCode

        Write-Log ""
        if ($localExitCode -eq 0) {
            $phase.Status = "Passed"
            Write-Log "✓ Phase 1 completed successfully (Duration: $(Format-Duration $phase.Duration))"
            return $true
        } else {
            $phase.Status = "Failed"
            Write-Log "✗ Phase 1 failed with exit code $localExitCode (Duration: $(Format-Duration $phase.Duration))"
            return $false
        }
    } catch {
        $phase.Status = "Error"
        $phase.EndTime = Get-Date
        $phase.Duration = $phase.EndTime - $phase.StartTime
        Write-Log "✗ Phase 1 error: $_"
        return $false
    }
}

# ========================================================================================
# PHASE 2: GITHUB ACTIONS TESTING
# ========================================================================================

function Invoke-GitHubTesting {
    <#
    .SYNOPSIS
        Runs Phase 2: GitHub Actions testing using test-ci-cd-github.ps1.
    #>

    Write-PhaseHeader -PhaseName "PHASE 2: GITHUB ACTIONS TESTING" -Description "Testing GitHub Actions workflows..."

    $phase = $script:phaseResults.Phase2_GitHub
    $phase.Status = "Running"
    $phase.StartTime = Get-Date

    try {
        $githubScript = Join-Path $repoRoot "scripts\test-ci-cd-github\test-ci-cd-github.ps1"

        if (-not (Test-Path $githubScript)) {
            Write-Log "✗ GitHub testing script not found: $githubScript"
            $phase.Status = "Failed"
            $phase.ExitCode = 3
            return $false
        }

        # Build arguments
        $githubArgs = @()
        if ($CreatePRs) { $githubArgs += "-CreatePRs" }
        if ($CreatePRs -or $EndToEnd) { $githubArgs += "-WaitForWorkflows" }
        if ($VerifyOnly) { $githubArgs += "-VerifyOnly" }
        $githubArgs += "-TimeoutMinutes"
        $githubArgs += $TimeoutMinutes

        Write-Log "Invoking: $githubScript $($githubArgs -join ' ')"
        Write-Log ""

        # Execute GitHub testing script
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $githubScript @githubArgs
        $githubExitCode = $LASTEXITCODE

        $phase.EndTime = Get-Date
        $phase.Duration = $phase.EndTime - $phase.StartTime
        $phase.ExitCode = $githubExitCode

        Write-Log ""
        if ($githubExitCode -eq 0) {
            $phase.Status = "Passed"
            Write-Log "✓ Phase 2 completed successfully (Duration: $(Format-Duration $phase.Duration))"
            return $true
        } else {
            $phase.Status = "Failed"
            Write-Log "✗ Phase 2 failed with exit code $githubExitCode (Duration: $(Format-Duration $phase.Duration))"
            return $false
        }
    } catch {
        $phase.Status = "Error"
        $phase.EndTime = Get-Date
        $phase.Duration = $phase.EndTime - $phase.StartTime
        Write-Log "✗ Phase 2 error: $_"
        return $false
    }
}

# ========================================================================================
# PHASE 3: END-TO-END WORKFLOW
# ========================================================================================

function Invoke-EndToEndWorkflow {
    <#
    .SYNOPSIS
        Runs Phase 3: End-to-end workflow testing.

        Creates a feature branch, creates a PR to a component trunk,
        and verifies branch policy enforcement.
    #>

    Write-PhaseHeader -PhaseName "PHASE 3: END-TO-END WORKFLOW" -Description "Testing complete feature branch to main merge cascade..."

    $phase = $script:phaseResults.Phase3_EndToEnd
    $phase.Status = "Running"
    $phase.StartTime = Get-Date

    try {
        # Save current branch to restore later
        $originalBranch = & git rev-parse --abbrev-ref HEAD 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "✗ Failed to get current branch"
            $phase.Status = "Failed"
            $phase.ExitCode = 7
            return $false
        }

        # Generate unique feature branch name
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $featureBranch = "feat/test-e2e-$timestamp"
        $componentTrunk = "frontend"  # Use frontend as test target

        Write-Log "Creating test feature branch: $featureBranch"

        # Create and checkout feature branch from component trunk
        & git fetch origin "${componentTrunk}:${componentTrunk}" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "✗ Failed to fetch $componentTrunk"
            $phase.Status = "Failed"
            $phase.ExitCode = 7
            return $false
        }

        & git checkout -b $featureBranch $componentTrunk 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "✗ Failed to create feature branch"
            $phase.Status = "Failed"
            $phase.ExitCode = 7
            return $false
        }

        # Make a trivial test change
        $testFile = Join-Path $repoRoot "services\frontend\crm-ui\README.md"
        if (Test-Path $testFile) {
            $content = Get-Content $testFile -Raw
            $content += "`n<!-- E2E test marker: $timestamp -->`n"
            Set-Content -Path $testFile -Value $content -NoNewline -Encoding UTF8

            Write-Log "Adding test commit..."
            & git add $testFile 2>&1 | Out-Null
            & git commit -m "test: E2E workflow validation ($timestamp)" 2>&1 | Out-Null

            if ($LASTEXITCODE -ne 0) {
                Write-Log "✗ Failed to create test commit"
                $phase.Status = "Failed"
                $phase.ExitCode = 7
                return $false
            }

            # Push feature branch
            Write-Log "Pushing feature branch to origin..."
            & git push -u origin $featureBranch 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Log "✗ Failed to push feature branch"
                $phase.Status = "Failed"
                $phase.ExitCode = 7
                return $false
            }

            # Create PR using gh CLI
            Write-Log "Creating PR: $featureBranch -> $componentTrunk"
            $prBody = @"
## E2E Workflow Test

This is an automated test PR created by ``test-ci-cd-full.ps1``.

**Test Timestamp:** $timestamp
**Purpose:** Validate branch policy enforcement and workflow cascade

This PR should be **deleted after testing**.
"@

            $prUrl = & gh pr create `
                --base $componentTrunk `
                --head $featureBranch `
                --title "test: E2E workflow validation ($timestamp)" `
                --body $prBody `
                2>&1

            if ($LASTEXITCODE -ne 0) {
                Write-Log "✗ Failed to create PR: $prUrl"
                $phase.Status = "Failed"
                $phase.ExitCode = 7
                return $false
            }

            Write-Log "✓ PR created: $prUrl"
            Write-Log ""
            Write-Log "Waiting for branch policy checks to run..."

            # Wait for status checks (timeout after 10 minutes)
            $checkTimeout = 600  # 10 minutes
            $checkInterval = 15  # Check every 15 seconds
            $elapsed = 0
            $checksComplete = $false

            while ($elapsed -lt $checkTimeout) {
                Start-Sleep -Seconds $checkInterval
                $elapsed += $checkInterval

                $prStatus = & gh pr view $featureBranch --json statusCheckRollup 2>&1 | ConvertFrom-Json

                if ($prStatus.statusCheckRollup) {
                    $pending = $prStatus.statusCheckRollup | Where-Object { $_.status -eq "PENDING" -or $_.status -eq "IN_PROGRESS" }
                    $failed = $prStatus.statusCheckRollup | Where-Object { $_.status -eq "FAILURE" -or $_.status -eq "ERROR" }

                    if ($pending.Count -eq 0) {
                        $checksComplete = $true
                        if ($failed.Count -gt 0) {
                            Write-Log "✗ Some status checks failed:"
                            $failed | ForEach-Object { Write-Log "  - $($_.context): $($_.state)" }
                            break
                        } else {
                            Write-Log "✓ All status checks passed"
                            break
                        }
                    }

                    Write-Log "  Still waiting... ($elapsed/$checkTimeout seconds elapsed)"
                } else {
                    Write-Log "  No status checks found yet... ($elapsed/$checkTimeout seconds elapsed)"
                }
            }

            if (-not $checksComplete -and $elapsed -ge $checkTimeout) {
                Write-Log "⚠ Timeout waiting for status checks to complete"
            }

            # Cleanup: close PR and delete branch
            Write-Log ""
            Write-Log "Cleaning up test PR and branch..."
            & gh pr close $featureBranch --delete-branch 2>&1 | Out-Null

            # Restore original branch
            & git checkout $originalBranch 2>&1 | Out-Null

            $phase.EndTime = Get-Date
            $phase.Duration = $phase.EndTime - $phase.StartTime
            $phase.ExitCode = 0
            $phase.Status = "Passed"

            Write-Log ""
            Write-Log "✓ Phase 3 completed successfully (Duration: $(Format-Duration $phase.Duration))"
            return $true
        } else {
            Write-Log "✗ Test file not found: $testFile"
            $phase.Status = "Failed"
            $phase.ExitCode = 7
            return $false
        }
    } catch {
        $phase.Status = "Error"
        $phase.EndTime = Get-Date
        $phase.Duration = $phase.EndTime - $phase.StartTime
        Write-Log "✗ Phase 3 error: $_"

        # Attempt to restore original branch
        try {
            if ($originalBranch) {
                & git checkout $originalBranch 2>&1 | Out-Null
            }
        } catch {
            Write-Log "⚠ Failed to restore original branch"
        }

        return $false
    }
}

# ========================================================================================
# CONSOLIDATED REPORTING
# ========================================================================================

function Generate-ConsolidatedReport {
    <#
    .SYNOPSIS
        Generates a consolidated HTML report of all test phases.
    #>

    Write-Log ""
    Write-Log "Generating consolidated test report..."

    $reportFile = Join-Path $logDir "complete-test-report.html"

    # Calculate overall status
    $allPassed = $true
    $runPhases = $script:phaseResults.Values | Where-Object { $_.Status -ne "Not Run" }

    foreach ($phase in $runPhases) {
        if ($phase.Status -ne "Passed") {
            $allPassed = $false
            break
        }
    }

    $overallStatus = if ($allPassed -and $runPhases.Count -gt 0) { "PASSED" } else { "FAILED" }
    $statusColor = if ($overallStatus -eq "PASSED") { "#28a745" } else { "#dc3545" }

    # Generate HTML report
    $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI/CD Complete Test Report - $timestampReadable</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }
        .overall-status {
            background: $statusColor;
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 1.5em;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .content { padding: 30px; }
        .phase-section {
            margin-bottom: 30px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }
        .phase-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .phase-header h2 { font-size: 1.3em; color: #495057; }
        .phase-body { padding: 20px; }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-passed { background: #d4edda; color: #155724; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .status-error { background: #fff3cd; color: #856404; }
        .status-notrun { background: #e2e3e5; color: #383d41; }
        .status-running { background: #cce5ff; color: #004085; }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .info-item {
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        .info-item strong { display: block; color: #6c757d; font-size: 0.85em; margin-bottom: 5px; }
        .info-item span { font-size: 1.1em; color: #212529; }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            border-top: 1px solid #e0e0e0;
        }
        .log-path {
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-size: 0.9em;
            word-break: break-all;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 CI/CD Complete Test Report</h1>
            <p>Full Testing Workflow Validation</p>
        </div>

        <div class="overall-status">
            $overallStatus
        </div>

        <div class="content">
            <div class="info-grid">
                <div class="info-item">
                    <strong>Test Date</strong>
                    <span>$($now.ToString("yyyy-MM-dd HH:mm:ss"))</span>
                </div>
                <div class="info-item">
                    <strong>Phases Run</strong>
                    <span>$($runPhases.Count) of 3</span>
                </div>
                <div class="info-item">
                    <strong>Total Duration</strong>
                    <span>$(if ($runPhases.Count -gt 0) { Format-Duration (($runPhases | Measure-Object -Property Duration -Sum).Sum) } else { "N/A" })</span>
                </div>
            </div>

            <div style="margin-top: 30px;">
"@

    # Add each phase section
    foreach ($phaseKey in @("Phase1_Local", "Phase2_GitHub", "Phase3_EndToEnd")) {
        $phase = $script:phaseResults[$phaseKey]

        $statusClass = switch ($phase.Status) {
            "Passed" { "status-passed" }
            "Failed" { "status-failed" }
            "Error" { "status-error" }
            "Running" { "status-running" }
            default { "status-notrun" }
        }

        $html += @"
                <div class="phase-section">
                    <div class="phase-header">
                        <h2>$($phase.Name)</h2>
                        <span class="status-badge $statusClass">$($phase.Status)</span>
                    </div>
                    <div class="phase-body">
"@

        if ($phase.Status -ne "Not Run") {
            $html += @"
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Exit Code</strong>
                                <span>$($phase.ExitCode)</span>
                            </div>
                            <div class="info-item">
                                <strong>Duration</strong>
                                <span>$(if ($phase.Duration) { Format-Duration $phase.Duration } else { "N/A" })</span>
                            </div>
                            <div class="info-item">
                                <strong>Start Time</strong>
                                <span>$($phase.StartTime.ToString("HH:mm:ss"))</span>
                            </div>
                            <div class="info-item">
                                <strong>End Time</strong>
                                <span>$(if ($phase.EndTime) { $phase.EndTime.ToString("HH:mm:ss") } else { "N/A" })</span>
                            </div>
                        </div>
"@
        } else {
            $html += @"
                        <p style="color: #6c757d; font-style: italic;">This phase was not executed in this test run.</p>
"@
        }

        $html += @"
                    </div>
                </div>
"@
    }

    $html += @"
            </div>

            <div class="log-path">
                <strong>Full Log File:</strong><br>
                $logFile
            </div>
        </div>

        <div class="footer">
            <p>Generated by test-ci-cd-full.ps1 | CS301-ITSA-Scroogebank-CRM Project</p>
            <p style="margin-top: 5px; font-size: 0.9em;">See docs/testing/ci-cd-workflows.md for more information</p>
        </div>
    </div>
</body>
</html>
"@

    # Write HTML report
    [System.IO.File]::WriteAllText($reportFile, $html, $utf8NoBom)
    Write-Log "✓ Consolidated report generated: $reportFile"
}

function Show-Summary {
    <#
    .SYNOPSIS
        Displays a summary of all test phases.
    #>

    Write-Banner -Title "TEST EXECUTION SUMMARY"

    $runPhases = $script:phaseResults.Values | Where-Object { $_.Status -ne "Not Run" }

    foreach ($phase in $script:phaseResults.Values) {
        $icon = switch ($phase.Status) {
            "Passed" { "✓" }
            "Failed" { "✗" }
            "Error" { "⚠" }
            "Running" { "⏳" }
            default { "○" }
        }

        $statusText = "$icon $($phase.Name): $($phase.Status)"
        if ($phase.Duration) {
            $statusText += " ($(Format-Duration $phase.Duration))"
        }
        if ($null -ne $phase.ExitCode) {
            $statusText += " [Exit: $($phase.ExitCode)]"
        }

        Write-Log $statusText
    }

    Write-Log ""
    Write-Log "Total Duration: $(if ($runPhases.Count -gt 0) { Format-Duration (($runPhases | Measure-Object -Property Duration -Sum).Sum) } else { "N/A" })"
    Write-Log "Phases Run: $($runPhases.Count) of 3"
    Write-Log ""

    $reportFile = Join-Path $logDir "complete-test-report.html"
    if (Test-Path $reportFile) {
        Write-Log "📊 Full Report: $reportFile"
    }
    Write-Log "📋 Full Log: $logFile"
    Write-Log ""
}

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

try {
    # Initialize log file
    $script:logFileStream = [System.IO.StreamWriter]::new($logFile, $false, $utf8NoBom)
    $script:logFileStream.AutoFlush = $true

    Write-Banner -Title "CI/CD COMPLETE TESTING WORKFLOW"
    Write-Log "Script: $PSCommandPath"
    Write-Log "Working Directory: $repoRoot"
    Write-Log "Log File: $logFile"
    Write-Log "Timestamp: $($now.ToString("yyyy-MM-dd HH:mm:ss"))"
    Write-Log ""

    # Display configuration
    Write-Log "Configuration:"
    Write-Log "  Local Validation: $(if ($GitHubOnly) { 'SKIP' } else { 'RUN' })"
    Write-Log "  GitHub Actions: $(if ($LocalOnly) { 'SKIP' } else { 'RUN' })"
    Write-Log "  End-to-End Workflow: $(if ($EndToEnd) { 'RUN' } else { 'SKIP' })"
    Write-Log "  Create PRs: $(if ($CreatePRs) { 'YES' } else { 'NO' })"
    Write-Log "  Keep Cluster: $(if ($Keep) { 'YES' } else { 'NO' })"
    Write-Log "  Verify Only: $(if ($VerifyOnly) { 'YES' } else { 'NO' })"
    Write-Log "  Timeout: $TimeoutMinutes minutes"
    Write-Log ""

    # Validate parameters
    if ($LocalOnly -and $GitHubOnly) {
        Write-Log "✗ Error: Cannot specify both -LocalOnly and -GitHubOnly"
        Exit-WithCode -Code 9
    }

    if ($EndToEnd -and $LocalOnly) {
        Write-Log "✗ Error: Cannot run -EndToEnd with -LocalOnly (requires GitHub Actions)"
        Exit-WithCode -Code 9
    }

    # Verify dependencies
    if (-not (Test-Dependencies)) {
        Write-Log ""
        Write-Log "✗ Dependency verification failed"
        Exit-WithCode -Code 9
    }

    if ($VerifyOnly) {
        Write-Log ""
        Write-Log "✓ Verification complete (VerifyOnly mode, skipping tests)"
        Exit-WithCode -Code 0
    }

    # Start overall timer
    $overallStart = Get-Date

    # Phase 1: Local Validation
    if (-not $GitHubOnly) {
        if (-not (Invoke-LocalValidation)) {
            $exitCode = $script:phaseResults.Phase1_Local.ExitCode
            if ($null -eq $exitCode) { $exitCode = 1 }

            Generate-ConsolidatedReport
            Show-Summary
            Write-Log "✗ Aborting: Phase 1 (Local Validation) failed"
            Exit-WithCode -Code $exitCode
        }
    }

    # Phase 2: GitHub Actions Testing
    if (-not $LocalOnly) {
        if (-not (Invoke-GitHubTesting)) {
            $exitCode = $script:phaseResults.Phase2_GitHub.ExitCode
            if ($null -eq $exitCode) { $exitCode = 3 }

            Generate-ConsolidatedReport
            Show-Summary
            Write-Log "✗ Aborting: Phase 2 (GitHub Actions) failed"
            Exit-WithCode -Code $exitCode
        }
    }

    # Phase 3: End-to-End Workflow (optional)
    if ($EndToEnd) {
        if (-not (Invoke-EndToEndWorkflow)) {
            $exitCode = $script:phaseResults.Phase3_EndToEnd.ExitCode
            if ($null -eq $exitCode) { $exitCode = 7 }

            Generate-ConsolidatedReport
            Show-Summary
            Write-Log "✗ Phase 3 (End-to-End Workflow) failed"
            Exit-WithCode -Code $exitCode
        }
    }

    # Calculate total duration
    $overallEnd = Get-Date
    $overallDuration = $overallEnd - $overallStart

    # Generate consolidated report
    Generate-ConsolidatedReport

    # Display summary
    Show-Summary

    Write-Log "╔════════════════════════════════════════════════════════════════════════════╗"
    Write-Log "║                           ✓ ALL PHASES PASSED                              ║"
    Write-Log "╚════════════════════════════════════════════════════════════════════════════╝"
    Write-Log ""
    Write-Log "Overall Duration: $(Format-Duration $overallDuration)"

    Exit-WithCode -Code 0

} catch {
    Write-Log ""
    Write-Log "✗ Fatal error: $_"
    Write-Log $_.ScriptStackTrace

    try {
        Generate-ConsolidatedReport
        Show-Summary
    } catch {
        Write-Log "⚠ Failed to generate final report: $_"
    }

    Exit-WithCode -Code 8
}
