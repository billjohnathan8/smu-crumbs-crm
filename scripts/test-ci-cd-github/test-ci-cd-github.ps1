#Requires -Version 5.1
<#
.SYNOPSIS
    Automates GitHub Actions workflow testing (Phase 2 of testing plan).

.DESCRIPTION
    This script automates Phase 2 of the CI/CD testing plan:
    1. Verifies gh CLI is installed and authenticated
    2. Creates test commits on component trunk branches
    3. Pushes commits to trigger GitHub Actions workflows
    4. Monitors workflow runs and collects results
    5. Optionally creates test PRs to validate branch policy rules
    6. Generates a JSON report of workflow results

    SAFETY: Runs in dry-run mode by default. Use -CreatePRs to actually create PRs.

.PARAMETER Branches
    Component trunk branches to test (default: all 6 components).

.PARAMETER SkipComponentTrunks
    Skip testing component trunk branches (frontend, backend services, infrastructure).

.PARAMETER SkipIntegration
    Skip testing integration branch workflow.

.PARAMETER SkipMain
    Skip testing main branch workflow.

.PARAMETER SkipBranchPolicy
    Skip branch policy validation (PR creation and checks).

.PARAMETER CreatePRs
    Actually create test PRs (default: dry-run mode, no PRs created).

.PARAMETER WaitForWorkflows
    Wait for workflow runs to complete (with timeout).

.PARAMETER VerifyOnly
    Only verify that gh CLI is installed and authenticated, don't run tests.

.PARAMETER TimeoutMinutes
    Maximum time to wait for workflow completion (default: 60 minutes).

.EXAMPLE
    .\test-ci-cd-github.ps1 -VerifyOnly
    Only check if gh CLI is installed and authenticated.

.EXAMPLE
    .\test-ci-cd-github.ps1 -WaitForWorkflows
    Push test commits and wait for workflows to complete.

.EXAMPLE
    .\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows
    Create test PRs and wait for branch policy checks to complete.

.NOTES
    Part of the CI/CD testing automation suite.
    See: docs/testing/ci-cd-workflows.md
#>

param(
    [string[]]$Branches = @("frontend", "agent-backend", "log-backend", "client-backend", "transaction-backend", "infrastructure"),
    [switch]$SkipComponentTrunks,
    [switch]$SkipIntegration,
    [switch]$SkipMain,
    [switch]$SkipBranchPolicy,
    [switch]$CreatePRs,
    [switch]$WaitForWorkflows,
    [switch]$VerifyOnly,
    [int]$TimeoutMinutes = 60
)

# ========================================
#  DEPRECATION WARNING
# ========================================
# This PowerShell script is DEPRECATED and will be removed in 2 weeks.
#
# Please use the new Python pipeline instead:
#   python scripts/pipelines/test_github_workflows.py
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
Write-Host "  python scripts/pipelines/test_github_workflows.py" -ForegroundColor Cyan
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

# Results tracking
$script:workflowResults = @{
    timestamp = $now.ToString("yyyy-MM-dd HH:mm:ss")
    repository = "cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3"
    branches = @{}
    prs = @{}
    summary = @{
        totalWorkflows = 0
        passedWorkflows = 0
        failedWorkflows = 0
        timedOutWorkflows = 0
        totalPRs = 0
        passedPRs = 0
        failedPRs = 0
    }
}

# Commit tracking for cleanup
$script:testCommits = @()

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

    # Save workflow results to JSON
    $resultsFile = Join-Path $logDir "workflow-results.json"
    try {
        $script:workflowResults | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultsFile -Encoding utf8 -Force
        Write-Log "Workflow results saved to: $resultsFile"
    } catch {
        Write-Log "WARNING: Failed to save workflow results: $($_.Exception.Message)"
    }

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

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$CommandName)
    $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-GhCliAvailable {
    <#
    .SYNOPSIS
        Checks if gh CLI is installed.
    #>
    Test-CommandAvailable -CommandName "gh"
}

function Test-GhCliAuthenticated {
    <#
    .SYNOPSIS
        Checks if gh CLI is authenticated.
    .RETURNS
        $true if authenticated, $false otherwise
    #>

    if (-not (Test-GhCliAvailable)) {
        return $false
    }

    try {
        $authStatus = & gh auth status 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Log "gh CLI authentication verified"
            return $true
        } else {
            Write-Log "gh CLI not authenticated. Output: $authStatus"
            return $false
        }
    } catch {
        Write-Log "ERROR: Failed to check gh auth status: $($_.Exception.Message)"
        return $false
    }
}

function Get-CurrentBranch {
    <#
    .SYNOPSIS
        Gets the current git branch name.
    #>
    try {
        $branch = & git rev-parse --abbrev-ref HEAD 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $branch.Trim()
        }
        return $null
    } catch {
        return $null
    }
}

function Get-CurrentCommitSha {
    <#
    .SYNOPSIS
        Gets the current git commit SHA.
    #>
    try {
        $sha = & git rev-parse HEAD 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $sha.Trim()
        }
        return $null
    } catch {
        return $null
    }
}

function New-TestCommit {
    <#
    .SYNOPSIS
        Creates a deterministic test commit on a branch.
    .PARAMETER BranchName
        The branch to commit to.
    .RETURNS
        Commit SHA if successful, $null otherwise
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$BranchName
    )

    try {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $testFile = ".github/.test-commit-$BranchName"

        Write-Log "Creating test commit on branch: $BranchName"

        # Checkout branch
        Write-Log "  Checking out branch..."
        & git checkout $BranchName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "  ERROR: Failed to checkout branch $BranchName"
            return $null
        }

        # Pull latest changes
        Write-Log "  Pulling latest changes..."
        & git pull origin $BranchName 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "  WARNING: Failed to pull latest changes (branch may not exist on remote)"
        }

        # Create or update test file
        $testContent = "Test commit for CI/CD validation`nBranch: $BranchName`nTimestamp: $timestamp`n"
        Set-Content -Path $testFile -Value $testContent -Encoding UTF8

        # Stage and commit
        Write-Log "  Staging test file..."
        & git add $testFile 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "  ERROR: Failed to stage test file"
            return $null
        }

        $commitMessage = "test(ci): workflow validation test [$timestamp]"
        Write-Log "  Creating commit..."
        & git commit -m $commitMessage 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "  ERROR: Failed to create commit"
            return $null
        }

        # Get commit SHA
        $commitSha = Get-CurrentCommitSha
        Write-Log "  Commit created: $commitSha"

        return $commitSha

    } catch {
        Write-Log "  ERROR: Exception during commit creation: $($_.Exception.Message)"
        return $null
    }
}

function Push-TestCommit {
    <#
    .SYNOPSIS
        Pushes a test commit to remote repository.
    .PARAMETER BranchName
        The branch to push.
    .PARAMETER CommitSha
        The commit SHA (for logging).
    .RETURNS
        $true if successful, $false otherwise
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [Parameter(Mandatory = $true)]
        [string]$CommitSha
    )

    try {
        Write-Log "Pushing commit $CommitSha to origin/$BranchName..."

        $pushOutput = & git push origin $BranchName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "ERROR: Failed to push to remote. Output: $pushOutput"
            return $false
        }

        Write-Log "✅ Successfully pushed to origin/$BranchName"
        return $true

    } catch {
        Write-Log "ERROR: Exception during push: $($_.Exception.Message)"
        return $false
    }
}

function Get-LatestWorkflowRun {
    <#
    .SYNOPSIS
        Gets the most recent workflow run for a branch.
    .PARAMETER BranchName
        The branch name.
    .RETURNS
        Workflow run object with id, status, conclusion, url
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$BranchName
    )

    try {
        Write-Log "Fetching latest workflow run for branch: $BranchName"

        # Wait a few seconds for GitHub to register the push
        Start-Sleep -Seconds 5

        $runJson = & gh run list --branch $BranchName --limit 1 --json databaseId,status,conclusion,createdAt,url 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Log "WARNING: Failed to fetch workflow run. Output: $runJson"
            return $null
        }

        $runs = $runJson | ConvertFrom-Json

        if ($runs.Count -eq 0) {
            Write-Log "WARNING: No workflow runs found for branch $BranchName"
            return $null
        }

        $run = $runs[0]

        Write-Log "  Found workflow run: ID=$($run.databaseId), Status=$($run.status), Conclusion=$($run.conclusion)"
        Write-Log "  URL: $($run.url)"

        return @{
            id = $run.databaseId
            status = $run.status
            conclusion = $run.conclusion
            createdAt = $run.createdAt
            url = $run.url
        }

    } catch {
        Write-Log "ERROR: Exception fetching workflow run: $($_.Exception.Message)"
        return $null
    }
}

function Wait-ForWorkflowCompletion {
    <#
    .SYNOPSIS
        Waits for a workflow run to complete with timeout.
    .PARAMETER RunId
        The workflow run database ID.
    .PARAMETER BranchName
        The branch name (for logging).
    .PARAMETER TimeoutMinutes
        Maximum time to wait.
    .RETURNS
        Workflow result: 'success', 'failure', 'cancelled', 'timeout', or $null
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$RunId,
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [int]$TimeoutMinutes = 60
    )

    $startTime = Get-Date
    $timeoutSeconds = $TimeoutMinutes * 60
    $pollIntervalSeconds = 30

    Write-Log "Waiting for workflow run $RunId to complete (timeout: $TimeoutMinutes min)..."

    while ($true) {
        $elapsed = (Get-Date) - $startTime

        if ($elapsed.TotalSeconds -gt $timeoutSeconds) {
            Write-Log "⏱️  TIMEOUT: Workflow did not complete within $TimeoutMinutes minutes"
            return "timeout"
        }

        try {
            $runJson = & gh run view $RunId --json status,conclusion,url 2>&1

            if ($LASTEXITCODE -ne 0) {
                Write-Log "WARNING: Failed to fetch workflow status. Output: $runJson"
                Start-Sleep -Seconds $pollIntervalSeconds
                continue
            }

            $run = $runJson | ConvertFrom-Json

            Write-Log "  [$('{0:mm}:{0:ss}' -f $elapsed)] Status: $($run.status), Conclusion: $($run.conclusion)"

            if ($run.status -eq "completed") {
                $conclusion = $run.conclusion

                if ($conclusion -eq "success") {
                    Write-Log "✅ Workflow completed successfully"
                    return "success"
                } elseif ($conclusion -eq "failure") {
                    Write-Log "❌ Workflow failed"
                    Write-Log "   URL: $($run.url)"
                    return "failure"
                } elseif ($conclusion -eq "cancelled") {
                    Write-Log "🚫 Workflow was cancelled"
                    return "cancelled"
                } else {
                    Write-Log "⚠️  Workflow completed with conclusion: $conclusion"
                    return $conclusion
                }
            }

            # Still running, wait and poll again
            Start-Sleep -Seconds $pollIntervalSeconds

        } catch {
            Write-Log "ERROR: Exception while polling workflow: $($_.Exception.Message)"
            Start-Sleep -Seconds $pollIntervalSeconds
        }
    }
}

function New-TestPullRequest {
    <#
    .SYNOPSIS
        Creates a test PR for branch policy validation.
    .PARAMETER HeadBranch
        The source branch (component trunk).
    .PARAMETER BaseBranch
        The target branch (integration or main).
    .PARAMETER DryRun
        If true, don't actually create the PR.
    .RETURNS
        PR object with url, number, checks
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$HeadBranch,
        [Parameter(Mandatory = $true)]
        [string]$BaseBranch,
        [bool]$DryRun = $true
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $prTitle = "test(ci): Branch policy validation - $HeadBranch -> $BaseBranch"
    $prBody = @"
## CI/CD Test PR

This is an automated test PR created to validate branch policy rules.

- **Source Branch**: $HeadBranch
- **Target Branch**: $BaseBranch
- **Created**: $timestamp
- **Purpose**: Validate branch protection and required checks

**This PR should NOT be merged. It will be closed automatically after validation.**
"@

    if ($DryRun) {
        Write-Log "DRY RUN: Would create PR: $HeadBranch -> $BaseBranch"
        Write-Log "  Title: $prTitle"
        return @{
            url = "dry-run"
            number = 0
            checks = @()
            dryRun = $true
        }
    }

    try {
        Write-Log "Creating PR: $HeadBranch -> $BaseBranch"

        $prJson = & gh pr create --base $BaseBranch --head $HeadBranch --title $prTitle --body $prBody --json url,number 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Log "ERROR: Failed to create PR. Output: $prJson"
            return $null
        }

        $pr = $prJson | ConvertFrom-Json

        Write-Log "✅ PR created: #$($pr.number)"
        Write-Log "   URL: $($pr.url)"

        return @{
            url = $pr.url
            number = $pr.number
            checks = @()
            dryRun = $false
        }

    } catch {
        Write-Log "ERROR: Exception creating PR: $($_.Exception.Message)"
        return $null
    }
}

function Get-PullRequestChecks {
    <#
    .SYNOPSIS
        Gets the status of PR checks.
    .PARAMETER PrUrl
        The PR URL.
    .RETURNS
        Array of check results
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$PrUrl
    )

    try {
        Write-Log "Fetching PR checks for: $PrUrl"

        $checksOutput = & gh pr checks $PrUrl 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Log "WARNING: Failed to fetch PR checks. Output: $checksOutput"
            return @()
        }

        # Parse gh pr checks output (tab-separated format)
        $checks = @()
        $checksOutput | ForEach-Object {
            if ($_ -match '^(.+?)\t(.+?)\t(.+)$') {
                $checks += @{
                    name = $matches[1].Trim()
                    status = $matches[2].Trim()
                    conclusion = $matches[3].Trim()
                }
            }
        }

        return $checks

    } catch {
        Write-Log "ERROR: Exception fetching PR checks: $($_.Exception.Message)"
        return @()
    }
}

function Test-BranchPolicyRules {
    <#
    .SYNOPSIS
        Tests branch policy rules by creating test PRs.
    .PARAMETER ComponentBranches
        Array of component trunk branches.
    .PARAMETER CreatePRs
        Actually create PRs (not dry-run).
    .RETURNS
        0 if all policies pass, 1 if any fail
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$ComponentBranches,
        [bool]$CreatePRs = $false
    )

    Write-Log "=================================================="
    Write-Log "PHASE 2.3: Branch Policy Validation"
    Write-Log "=================================================="

    if (-not $CreatePRs) {
        Write-Log "DRY RUN MODE: No PRs will be created"
        Write-Log "Use -CreatePRs flag to actually create test PRs"
    }

    $policyViolations = 0

    foreach ($branch in $ComponentBranches) {
        Write-Log ""
        Write-Log "Testing branch policy: $branch -> integration"

        # Create test PR to integration
        $pr = New-TestPullRequest -HeadBranch $branch -BaseBranch "integration" -DryRun (-not $CreatePRs)

        if ($pr -and -not $pr.dryRun) {
            # Record PR
            $script:workflowResults.prs[$branch] = $pr
            $script:workflowResults.summary.totalPRs++

            # Wait for checks to start
            Start-Sleep -Seconds 10

            # Get PR checks
            $checks = Get-PullRequestChecks -PrUrl $pr.url
            $pr.checks = $checks

            # Analyze checks
            $failedChecks = $checks | Where-Object { $_.conclusion -eq "failure" }

            if ($failedChecks.Count -gt 0) {
                Write-Log "❌ Branch policy violations detected:"
                $failedChecks | ForEach-Object {
                    Write-Log "   - $($_.name): $($_.conclusion)"
                }
                $policyViolations++
            } else {
                Write-Log "✅ All required checks passed"
                $script:workflowResults.summary.passedPRs++
            }

            # Close the test PR
            Write-Log "Closing test PR #$($pr.number)..."
            & gh pr close $pr.number --delete-branch=false 2>&1 | Out-Null
        }
    }

    if ($policyViolations -gt 0) {
        $script:workflowResults.summary.failedPRs = $policyViolations
        Write-Log ""
        Write-Log "❌ Branch policy validation failed: $policyViolations violations"
        return 1
    } else {
        Write-Log ""
        Write-Log "✅ Branch policy validation passed"
        return 0
    }
}

function Test-Dependencies {
    <#
    .SYNOPSIS
        Verifies that all required dependencies are installed.
    .RETURNS
        0 if all dependencies available, 1 if any missing
    #>

    Write-Log "=================================================="
    Write-Log "Dependency Check"
    Write-Log "=================================================="

    $allDependenciesAvailable = $true

    # Check git
    if (Test-CommandAvailable -CommandName "git") {
        Write-Log "✅ git - Version control"
    } else {
        Write-Log "❌ git - Version control NOT FOUND"
        $allDependenciesAvailable = $false
    }

    # Check gh CLI
    if (Test-GhCliAvailable) {
        Write-Log "✅ gh - GitHub CLI"

        # Check authentication
        if (Test-GhCliAuthenticated) {
            Write-Log "✅ gh - Authenticated"
        } else {
            Write-Log "❌ gh - NOT AUTHENTICATED"
            Write-Log "   Run: gh auth login"
            $allDependenciesAvailable = $false
        }
    } else {
        Write-Log "❌ gh - GitHub CLI NOT FOUND"
        Write-Log "   Install: https://cli.github.com/"
        $allDependenciesAvailable = $false
    }

    if ($allDependenciesAvailable) {
        Write-Log ""
        Write-Log "All required dependencies are available."
        return 0
    } else {
        Write-Log ""
        Write-Log "Some required dependencies are missing. Please install them and retry."
        return 1
    }
}

function Invoke-ComponentTrunkTests {
    <#
    .SYNOPSIS
        Tests workflows on component trunk branches.
    .RETURNS
        0 if all pass, 1 if any fail
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$BranchesToTest
    )

    Write-Log "=================================================="
    Write-Log "PHASE 2.1: Component Trunk Branch Workflows"
    Write-Log "=================================================="

    $originalBranch = Get-CurrentBranch
    $failedBranches = 0

    foreach ($branch in $BranchesToTest) {
        Write-Log ""
        Write-Log "--------------------------------------------------"
        Write-Log "Testing branch: $branch"
        Write-Log "--------------------------------------------------"

        # Create test commit
        $commitSha = New-TestCommit -BranchName $branch

        if (-not $commitSha) {
            Write-Log "❌ Failed to create test commit on $branch"
            $failedBranches++
            continue
        }

        # Record commit for potential cleanup
        $script:testCommits += @{
            branch = $branch
            sha = $commitSha
        }

        # Prompt for confirmation
        Write-Log ""
        Write-Log "Ready to push commit $commitSha to origin/$branch"
        Write-Log "This will trigger GitHub Actions workflows."
        $confirmation = Read-Host "Continue? (Y/n)"

        if ($confirmation -eq 'n' -or $confirmation -eq 'N') {
            Write-Log "Skipped push for $branch"
            continue
        }

        # Push commit
        $pushed = Push-TestCommit -BranchName $branch -CommitSha $commitSha

        if (-not $pushed) {
            Write-Log "❌ Failed to push commit on $branch"
            $failedBranches++
            continue
        }

        # Get workflow run
        $workflowRun = Get-LatestWorkflowRun -BranchName $branch

        if (-not $workflowRun) {
            Write-Log "⚠️  Could not fetch workflow run for $branch"
            $script:workflowResults.branches[$branch] = @{
                commit = $commitSha
                workflowRun = $null
                result = "unknown"
            }
            continue
        }

        # Record workflow run
        $script:workflowResults.branches[$branch] = @{
            commit = $commitSha
            workflowRun = $workflowRun
            result = "pending"
        }
        $script:workflowResults.summary.totalWorkflows++

        # Wait for completion if requested
        if ($WaitForWorkflows) {
            $result = Wait-ForWorkflowCompletion -RunId $workflowRun.id -BranchName $branch -TimeoutMinutes $TimeoutMinutes

            $script:workflowResults.branches[$branch].result = $result

            if ($result -eq "success") {
                $script:workflowResults.summary.passedWorkflows++
            } elseif ($result -eq "timeout") {
                $script:workflowResults.summary.timedOutWorkflows++
                $failedBranches++
            } else {
                $script:workflowResults.summary.failedWorkflows++
                $failedBranches++
            }
        }
    }

    # Return to original branch
    if ($originalBranch) {
        Write-Log ""
        Write-Log "Returning to original branch: $originalBranch"
        & git checkout $originalBranch 2>&1 | Out-Null
    }

    if ($failedBranches -gt 0) {
        Write-Log ""
        Write-Log "❌ Component trunk workflow tests: $failedBranches failures"
        return 1
    } else {
        Write-Log ""
        Write-Log "✅ Component trunk workflow tests completed"
        return 0
    }
}

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

try {
    # Open log file
    $script:logFileStream = [System.IO.StreamWriter]::new($logFile, $false, $utf8NoBom)

    Write-Log "=================================================="
    Write-Log "GitHub Actions Workflow Testing Script"
    Write-Log "=================================================="
    Write-Log "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Log "Repository: cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3"
    Write-Log "Log file: $logFile"
    Write-Log ""

    # Dependency check
    $depCheckResult = Test-Dependencies

    if ($depCheckResult -ne 0) {
        Write-Log ""
        Write-Log "❌ Dependency check failed. Exiting."
        Exit-WithCode -Code 3
    }

    if ($VerifyOnly) {
        Write-Log ""
        Write-Log "✅ Verify-only mode: Dependencies check complete. Exiting."
        Exit-WithCode -Code 0
    }

    Write-Log ""

    # Phase 2.1: Component trunk workflows
    $componentResult = 0
    if (-not $SkipComponentTrunks) {
        $componentResult = Invoke-ComponentTrunkTests -BranchesToTest $Branches
    } else {
        Write-Log "=================================================="
        Write-Log "PHASE 2.1: Component Trunk Workflows (SKIPPED)"
        Write-Log "=================================================="
    }

    # Phase 2.2: Integration and main branch workflows
    # (Simplified - can be expanded similar to component trunks)
    if (-not $SkipIntegration) {
        Write-Log ""
        Write-Log "=================================================="
        Write-Log "PHASE 2.2: Integration Branch Workflow (TODO)"
        Write-Log "=================================================="
        Write-Log "Integration branch testing not yet implemented"
    }

    if (-not $SkipMain) {
        Write-Log ""
        Write-Log "=================================================="
        Write-Log "PHASE 2.2: Main Branch Workflow (TODO)"
        Write-Log "=================================================="
        Write-Log "Main branch testing not yet implemented"
    }

    # Phase 2.3: Branch policy validation
    $policyResult = 0
    if (-not $SkipBranchPolicy) {
        Write-Log ""
        $policyResult = Test-BranchPolicyRules -ComponentBranches $Branches -CreatePRs $CreatePRs
    } else {
        Write-Log ""
        Write-Log "=================================================="
        Write-Log "PHASE 2.3: Branch Policy Validation (SKIPPED)"
        Write-Log "=================================================="
    }

    # Summary
    Write-Log ""
    Write-Log "=================================================="
    Write-Log "SUMMARY"
    Write-Log "=================================================="
    Write-Log "Workflows:"
    Write-Log "  Total:     $($script:workflowResults.summary.totalWorkflows)"
    Write-Log "  Passed:    $($script:workflowResults.summary.passedWorkflows)"
    Write-Log "  Failed:    $($script:workflowResults.summary.failedWorkflows)"
    Write-Log "  Timed out: $($script:workflowResults.summary.timedOutWorkflows)"
    Write-Log ""
    Write-Log "Pull Requests:"
    Write-Log "  Total:  $($script:workflowResults.summary.totalPRs)"
    Write-Log "  Passed: $($script:workflowResults.summary.passedPRs)"
    Write-Log "  Failed: $($script:workflowResults.summary.failedPRs)"
    Write-Log ""

    # Determine exit code
    $exitCode = 0

    if ($componentResult -ne 0) {
        Write-Log "❌ Component trunk workflows failed"
        $exitCode = 1
    }

    if ($policyResult -ne 0) {
        Write-Log "❌ Branch policy validation failed"
        $exitCode = 2
    }

    if ($script:workflowResults.summary.timedOutWorkflows -gt 0) {
        Write-Log "⏱️  Some workflows timed out"
        if ($exitCode -eq 0) {
            $exitCode = 4
        }
    }

    if ($exitCode -eq 0) {
        Write-Log ""
        Write-Log "✅ GitHub Actions workflow testing completed successfully"
    } else {
        Write-Log ""
        Write-Log "❌ GitHub Actions workflow testing completed with errors"
    }

    Write-Log ""
    Write-Log "Results saved to: $(Join-Path $logDir 'workflow-results.json')"

    if ($script:testCommits.Count -gt 0) {
        Write-Log ""
        Write-Log "Test commits created (for potential cleanup):"
        $script:testCommits | ForEach-Object {
            Write-Log "  $($_.branch): $($_.sha)"
        }
    }

    Exit-WithCode -Code $exitCode

} catch {
    Write-Log "FATAL ERROR: $($_.Exception.Message)"
    Write-Log "Stack trace: $($_.ScriptStackTrace)"
    Exit-WithCode -Code 1
}
