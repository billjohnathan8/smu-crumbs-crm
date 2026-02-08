#Requires -Version 5.1
<#
.SYNOPSIS
    Automates local CI/CD validation (Phase 1 of testing plan).

.DESCRIPTION
    This script automates Phase 1 of the CI/CD testing plan:
    1. Validates GitHub workflow syntax using actionlint
    2. Runs the full local test pipeline (test-and-spinup-all.ps1)
    3. Generates a consolidated validation report

    Follows the fail-fast principle: catch issues locally before pushing to GitHub.

.PARAMETER SkipTests
    Skip the full local test pipeline and only run actionlint validation.

.PARAMETER SkipActionlint
    Skip actionlint validation and only run the local test pipeline.

.PARAMETER Keep
    Preserve the kind cluster after tests complete (passed to test-and-spinup-all.ps1).

.PARAMETER VerifyOnly
    Only verify that required dependencies are installed, don't run any tests.

.EXAMPLE
    .\test-ci-cd-local.ps1
    Run full local validation (actionlint + test pipeline).

.EXAMPLE
    .\test-ci-cd-local.ps1 -SkipTests
    Only run actionlint validation, skip the test pipeline.

.EXAMPLE
    .\test-ci-cd-local.ps1 -VerifyOnly
    Only check if dependencies are installed.

.NOTES
    Part of the CI/CD testing automation suite.
    See: docs/testing/ci-cd-workflows.md
#>

param(
    [switch]$SkipTests,
    [switch]$SkipActionlint,
    [switch]$Keep,
    [switch]$VerifyOnly
)

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
$timestampReadable = $now.ToString("yyyyMMdd-HHmmss")
$logFile = Join-Path $logDir ("inv{0}__{1}__{2}.log" -f $inverseTimestamp, $timestampReadable, $scriptName)

# UTF-8 encoding setup for Windows
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
[Console]::InputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

# Log file handle
$script:logFileStream = $null

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

function Test-ActionlintAvailable {
    Test-CommandAvailable -CommandName "actionlint"
}

function Test-DockerAvailable {
    if (-not (Test-CommandAvailable -CommandName "docker")) {
        return $false
    }

    try {
        $null = & docker info 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Install-ActionlintPortable {
    <#
    .SYNOPSIS
        Installs actionlint to .devtools/bin if not already available.
    #>

    Write-Log "actionlint not found. Attempting to install to .devtools/bin..."

    $devToolsBin = Join-Path $repoRoot ".devtools\bin"
    if (-not (Test-Path $devToolsBin)) {
        New-Item -Path $devToolsBin -ItemType Directory -Force | Out-Null
    }

    $actionlintExe = Join-Path $devToolsBin "actionlint.exe"

    if (Test-Path $actionlintExe) {
        Write-Log "actionlint already exists at $actionlintExe"
        $env:PATH = "$devToolsBin;$env:PATH"
        return $true
    }

    try {
        $url = "https://github.com/rhysd/actionlint/releases/latest/download/actionlint_1.7.5_windows_amd64.zip"
        $zipPath = Join-Path $env:TEMP "actionlint.zip"

        Write-Log "Downloading actionlint from $url..."
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

        Write-Log "Extracting to $devToolsBin..."
        Expand-Archive -Path $zipPath -DestinationPath $devToolsBin -Force

        Remove-Item -Path $zipPath -Force

        if (Test-Path $actionlintExe) {
            Write-Log "actionlint installed successfully to $actionlintExe"
            $env:PATH = "$devToolsBin;$env:PATH"
            return $true
        } else {
            Write-Log "ERROR: actionlint extraction failed"
            return $false
        }
    } catch {
        Write-Log "ERROR: Failed to install actionlint: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-ActionlintValidation {
    <#
    .SYNOPSIS
        Runs actionlint on all GitHub workflow files.
    .RETURNS
        0 if no errors, 1 if errors found
    #>

    Write-Log "=================================================="
    Write-Log "PHASE 1.1: actionlint Workflow Validation"
    Write-Log "=================================================="

    if (-not (Test-ActionlintAvailable)) {
        if (-not (Install-ActionlintPortable)) {
            Write-Log "ERROR: actionlint is not available and could not be installed."
            Write-Log "Please install manually:"
            Write-Log "  scoop install actionlint"
            Write-Log "  OR download from https://github.com/rhysd/actionlint/releases"
            return 1
        }
    }

    $workflowsDir = Join-Path $repoRoot ".github\workflows"

    if (-not (Test-Path $workflowsDir)) {
        Write-Log "ERROR: Workflows directory not found: $workflowsDir"
        return 1
    }

    Write-Log "Running actionlint on workflow files..."
    Write-Log "Directory: $workflowsDir"

    try {
        # Run actionlint on all workflow files
        $workflowFiles = Get-ChildItem -Path $workflowsDir -Recurse -Filter "*.yml" | Select-Object -ExpandProperty FullName

        Write-Log "Found $($workflowFiles.Count) workflow files to validate"

        $actionlintOutput = & actionlint -color $workflowFiles 2>&1
        $actionlintExitCode = $LASTEXITCODE

        if ($actionlintOutput) {
            $actionlintOutput | ForEach-Object { Write-Log $_ }
        }

        if ($actionlintExitCode -eq 0) {
            Write-Log "✅ actionlint validation PASSED - no errors found"
            return 0
        } else {
            Write-Log "❌ actionlint validation FAILED - errors found (exit code: $actionlintExitCode)"
            return 1
        }
    } catch {
        Write-Log "ERROR: actionlint execution failed: $($_.Exception.Message)"
        return 1
    }
}

function Invoke-LocalTestPipeline {
    <#
    .SYNOPSIS
        Runs the full local test pipeline (test-and-spinup-all.ps1).
    .RETURNS
        0 if success, non-zero if failed
    #>

    Write-Log "=================================================="
    Write-Log "PHASE 1.2: Local Test Pipeline"
    Write-Log "=================================================="

    $testScript = Join-Path $repoRoot "scripts\test-and-spinup-all\test-and-spinup-all.ps1"

    if (-not (Test-Path $testScript)) {
        Write-Log "ERROR: test-and-spinup-all.ps1 not found at $testScript"
        return 1
    }

    Write-Log "Running full local test pipeline..."
    Write-Log "Script: $testScript"

    if ($Keep) {
        Write-Log "Keep mode: kind cluster will be preserved after tests"
    }

    try {
        if ($Keep) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $testScript -Keep
        } else {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $testScript
        }

        $testExitCode = $LASTEXITCODE

        if ($testExitCode -eq 0) {
            Write-Log "✅ Local test pipeline PASSED"
            return 0
        } else {
            Write-Log "❌ Local test pipeline FAILED (exit code: $testExitCode)"
            return 1
        }
    } catch {
        Write-Log "ERROR: Test pipeline execution failed: $($_.Exception.Message)"
        return 1
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

    # Required dependencies
    $dependencies = @(
        @{ Name = "make"; Description = "Build automation" },
        @{ Name = "docker"; Description = "Container runtime"; CustomTest = { Test-DockerAvailable } },
        @{ Name = "kubectl"; Description = "Kubernetes CLI" },
        @{ Name = "kind"; Description = "Kubernetes in Docker" },
        @{ Name = "actionlint"; Description = "Workflow validator"; Optional = $SkipActionlint }
    )

    foreach ($dep in $dependencies) {
        $testFunc = $dep.CustomTest
        $available = if ($testFunc) { & $testFunc } else { Test-CommandAvailable -CommandName $dep.Name }

        if ($available) {
            Write-Log "✅ $($dep.Name) - $($dep.Description)"
        } elseif ($dep.Optional) {
            Write-Log "⚠️  $($dep.Name) - $($dep.Description) (skipped)"
        } else {
            Write-Log "❌ $($dep.Name) - $($dep.Description) NOT FOUND"
            $allDependenciesAvailable = $false
        }
    }

    # Optional dependencies
    $pythonCmd = Get-Command python, python3, py -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pythonCmd) {
        Write-Log "✅ python - Report generation (optional)"
    } else {
        Write-Log "⚠️  python - Report generation (optional, not found)"
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

# ========================================================================================
# MAIN EXECUTION
# ========================================================================================

try {
    # Open log file
    $script:logFileStream = [System.IO.StreamWriter]::new($logFile, $false, $utf8NoBom)

    Write-Log "=================================================="
    Write-Log "CI/CD Local Validation Script"
    Write-Log "=================================================="
    Write-Log "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Log "Repository: $repoRoot"
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
        Write-Log "Verify-only mode: Dependencies check complete. Exiting."
        Exit-WithCode -Code 0
    }

    Write-Log ""

    # Phase 1.1: actionlint validation
    $actionlintResult = 0
    if (-not $SkipActionlint) {
        $actionlintResult = Invoke-ActionlintValidation

        if ($actionlintResult -ne 0) {
            Write-Log ""
            Write-Log "❌ actionlint validation failed. Fix workflow syntax errors and retry."
            Write-Log "See errors above for details."
            Exit-WithCode -Code 1
        }
    } else {
        Write-Log "=================================================="
        Write-Log "PHASE 1.1: actionlint Validation (SKIPPED)"
        Write-Log "=================================================="
    }

    Write-Log ""

    # Phase 1.2: Local test pipeline
    $testResult = 0
    if (-not $SkipTests) {
        $testResult = Invoke-LocalTestPipeline

        if ($testResult -ne 0) {
            Write-Log ""
            Write-Log "❌ Local test pipeline failed."
            if ($Keep) {
                Write-Log "Kind cluster preserved for debugging."
                Write-Log "To cleanup: kind delete cluster --name cs301-crm"
            }
            Exit-WithCode -Code 2
        }
    } else {
        Write-Log "=================================================="
        Write-Log "PHASE 1.2: Local Test Pipeline (SKIPPED)"
        Write-Log "=================================================="
    }

    Write-Log ""
    Write-Log "=================================================="
    Write-Log "✅ LOCAL VALIDATION COMPLETED SUCCESSFULLY"
    Write-Log "=================================================="
    Write-Log ""
    Write-Log "Summary:"
    Write-Log "  - actionlint validation: $(if ($SkipActionlint) { 'SKIPPED' } elseif ($actionlintResult -eq 0) { 'PASSED ✅' } else { 'FAILED ❌' })"
    Write-Log "  - Local test pipeline:   $(if ($SkipTests) { 'SKIPPED' } elseif ($testResult -eq 0) { 'PASSED ✅' } else { 'FAILED ❌' })"
    Write-Log ""
    Write-Log "Next steps:"
    Write-Log "  - Review test coverage reports: build-logs\test-and-spinup-all\index.html"
    Write-Log "  - Proceed to GitHub Actions testing: .\scripts\test-ci-cd-github\test-ci-cd-github.ps1"
    Write-Log ""

    Exit-WithCode -Code 0

} catch {
    Write-Log "FATAL ERROR: $($_.Exception.Message)"
    Write-Log "Stack trace: $($_.ScriptStackTrace)"
    Exit-WithCode -Code 1
}
