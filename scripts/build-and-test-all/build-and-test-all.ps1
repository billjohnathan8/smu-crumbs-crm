# ========================================
#  DEPRECATION WARNING
# ========================================
# This PowerShell script is DEPRECATED and will be removed in 2 weeks.
#
# Please use the new Python pipeline instead:
#   python scripts/pipelines/test_all.py
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
Write-Host "  python scripts/pipelines/test_all.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "The new script works on Windows, macOS, and Linux." -ForegroundColor Green
Write-Host "See: docs/migration/pipeline-migration.md"
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 3

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Remove-AnsiEscapeCodes {
    param([string]$Text)
    # Remove ANSI escape sequences (colors, cursor movement, formatting, etc.)
    # Pattern matches: ESC [ ... m (colors/formatting) and ESC [ ... (cursor control)
    $Text -replace '\x1b\[[0-9;]*[a-zA-Z]', '' -replace '\x1b\([B0]', ''
}

if (-not $env:SCRIPT_RUN_LOG_CAPTURED) {
    $scriptPath = $PSCommandPath
    $scriptName = [System.IO.Path]::GetFileNameWithoutExtension($scriptPath)
    $scriptDir = Split-Path -Parent $scriptPath
    $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
    $logDir = Join-Path $repoRoot "build-logs\build-and-test-all"
    $now = Get-Date
    $timestampReadable = $now.ToString("yyyy-MM-dd_HH-mm-ss")
    $inverseTimestamp = "{0:D4}{1:D2}{2:D2}-{3:D2}{4:D2}{5:D2}" -f `
        (9999 - $now.Year), `
        (12 - $now.Month), `
        (31 - $now.Day), `
        (23 - $now.Hour), `
        (59 - $now.Minute), `
        (59 - $now.Second)
    $logFile = Join-Path $logDir ("inv{0}__{1}__{2}.log" -f $inverseTimestamp, $timestampReadable, $scriptName)

    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir | Out-Null
    }

    $env:SCRIPT_RUN_LOG_CAPTURED = "1"
    $env:BUILD_LOG_FILE = $logFile

    # CRITICAL: Set UTF-8 encoding in the WRAPPER process so the child process inherits it.
    # This prevents mojibake when spawned scripts output UTF-8 characters.
    $oldWrapperConsoleOutputEncoding = [Console]::OutputEncoding
    $oldWrapperConsoleInputEncoding = [Console]::InputEncoding
    $oldWrapperOutputEncoding = $OutputEncoding
    $oldWrapperCodePage = $null
    $oldWrapperConsoleOutputCP = $null
    $oldWrapperConsoleCP = $null

    try {
        Add-Type -ErrorAction SilentlyContinue -Namespace Win32 -Name ConsoleCP -MemberDefinition @"
using System.Runtime.InteropServices;
public static class ConsoleCP {
    [DllImport("kernel32.dll")] public static extern uint GetConsoleOutputCP();
    [DllImport("kernel32.dll")] public static extern uint GetConsoleCP();
    [DllImport("kernel32.dll")] public static extern bool SetConsoleOutputCP(uint wCodePageID);
    [DllImport("kernel32.dll")] public static extern bool SetConsoleCP(uint wCodePageID);
}
"@
        $oldWrapperConsoleOutputCP = [Win32.ConsoleCP]::GetConsoleOutputCP()
        $oldWrapperConsoleCP = [Win32.ConsoleCP]::GetConsoleCP()
    }
    catch {
        $oldWrapperConsoleOutputCP = $null
        $oldWrapperConsoleCP = $null
    }

    try {
        $cpLine = (& cmd /c chcp) 2>$null | Select-Object -First 1
        if ($cpLine -match "([0-9]{3,5})") {
            $oldWrapperCodePage = $Matches[1]
        }
    }
    catch {
        $oldWrapperCodePage = $null
    }

    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [Console]::OutputEncoding = $utf8NoBom
        [Console]::InputEncoding = $utf8NoBom
        $OutputEncoding = $utf8NoBom

        if ($null -ne $oldWrapperConsoleOutputCP) {
            [Win32.ConsoleCP]::SetConsoleOutputCP(65001) | Out-Null
            [Win32.ConsoleCP]::SetConsoleCP(65001) | Out-Null
        }
        & cmd /c "chcp 65001 >nul" 2>$null
    }
    catch {
        # Best-effort only.
    }

    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $hasNativePreference = $false
        $previousNativePreference = $null
        try {
            if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
                $hasNativePreference = $true
                $previousNativePreference = $PSNativeCommandUseErrorActionPreference
                $PSNativeCommandUseErrorActionPreference = $false
            }
            $ErrorActionPreference = "Continue"
            & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File $scriptPath @args 2>&1 |
                ForEach-Object { 
                    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        # Extract just the message from ErrorRecord to avoid "System.Management.Automation.RemoteException" in logs
                        $_.Exception.Message
                    } else {
                        $_.ToString()
                    }
                    Write-Host $line
                    Remove-AnsiEscapeCodes -Text $line
                } |
                Out-File -FilePath $logFile -Encoding utf8
            $exitCode = $LASTEXITCODE
        }
        finally {
            if ($hasNativePreference) {
                $PSNativeCommandUseErrorActionPreference = $previousNativePreference
            }
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
    finally {
        # Restore wrapper encoding/codepage.
        try {
            if ($oldWrapperConsoleOutputEncoding) { [Console]::OutputEncoding = $oldWrapperConsoleOutputEncoding }
            if ($oldWrapperConsoleInputEncoding) { [Console]::InputEncoding = $oldWrapperConsoleInputEncoding }
            if ($oldWrapperOutputEncoding) { $OutputEncoding = $oldWrapperOutputEncoding }
            if ($null -ne $oldWrapperConsoleOutputCP) { [Win32.ConsoleCP]::SetConsoleOutputCP([uint32]$oldWrapperConsoleOutputCP) | Out-Null }
            if ($null -ne $oldWrapperConsoleCP) { [Win32.ConsoleCP]::SetConsoleCP([uint32]$oldWrapperConsoleCP) | Out-Null }
            if ($oldWrapperCodePage) { & cmd /c ("chcp {0} >nul" -f $oldWrapperCodePage) 2>$null }
        }
        catch {
            # Ignore restore failures.
        }

        Remove-Item Env:SCRIPT_RUN_LOG_CAPTURED -ErrorAction SilentlyContinue
        Remove-Item Env:BUILD_LOG_FILE -ErrorAction SilentlyContinue
    }

    try {
        $logFiles = @(
            Get-ChildItem -Path $logDir -File -Filter "*.log" -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending
        )
        if ($logFiles.Count -gt 3) {
            $logFiles | Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
    catch {
        # Best-effort only.
    }

    exit $exitCode
}

# Ensure native commands are handled via exit codes.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$script:OldConsoleOutputEncoding = [Console]::OutputEncoding
$script:OldOutputEncoding = $OutputEncoding
$script:OldConsoleInputEncoding = [Console]::InputEncoding
$script:OldCodePage = $null
$script:OldConsoleOutputCP = $null
$script:OldConsoleCP = $null

try {
    Add-Type -ErrorAction SilentlyContinue -Namespace Win32 -Name ConsoleCP -MemberDefinition @"
using System.Runtime.InteropServices;
public static class ConsoleCP {
    [DllImport("kernel32.dll")] public static extern uint GetConsoleOutputCP();
    [DllImport("kernel32.dll")] public static extern uint GetConsoleCP();
    [DllImport("kernel32.dll")] public static extern bool SetConsoleOutputCP(uint wCodePageID);
    [DllImport("kernel32.dll")] public static extern bool SetConsoleCP(uint wCodePageID);
}
"@

    $script:OldConsoleOutputCP = [Win32.ConsoleCP]::GetConsoleOutputCP()
    $script:OldConsoleCP = [Win32.ConsoleCP]::GetConsoleCP()
}
catch {
    $script:OldConsoleOutputCP = $null
    $script:OldConsoleCP = $null
}

try {
    # Capture current console code page so we can restore it.
    $cpLine = (& cmd /c chcp) 2>$null | Select-Object -First 1
    if ($cpLine -match "([0-9]{3,5})") {
        $script:OldCodePage = $Matches[1]
    }
}
catch {
    $script:OldCodePage = $null
}

try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $utf8NoBom
    [Console]::InputEncoding = $utf8NoBom
    $OutputEncoding = $utf8NoBom

    # Ensure native tools emit UTF-8 cleanly (prevents mojibake in logs).
    if ($null -ne $script:OldConsoleOutputCP) {
        [Win32.ConsoleCP]::SetConsoleOutputCP(65001) | Out-Null
        [Win32.ConsoleCP]::SetConsoleCP(65001) | Out-Null
    }
    & cmd /c "chcp 65001 >nul" 2>$null
}
catch {
    # Best-effort only; some hosts may not allow changing encodings.
}

function Exit-WithCode {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Code
    )

    try {
        if ($script:OldConsoleOutputEncoding) {
            [Console]::OutputEncoding = $script:OldConsoleOutputEncoding
        }
        if ($script:OldConsoleInputEncoding) {
            [Console]::InputEncoding = $script:OldConsoleInputEncoding
        }
        if ($script:OldOutputEncoding) {
            $OutputEncoding = $script:OldOutputEncoding
        }
        if ($null -ne $script:OldConsoleOutputCP) {
            [Win32.ConsoleCP]::SetConsoleOutputCP([uint32]$script:OldConsoleOutputCP) | Out-Null
        }
        if ($null -ne $script:OldConsoleCP) {
            [Win32.ConsoleCP]::SetConsoleCP([uint32]$script:OldConsoleCP) | Out-Null
        }
        if ($script:OldCodePage) {
            & cmd /c ("chcp {0} >nul" -f $script:OldCodePage) 2>$null
        }
    }
    catch {
        # Ignore restore failures.
    }

    exit $Code
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

if ($env:BUILD_LOG_FILE) {
    Write-Log "Build log file: $($env:BUILD_LOG_FILE)"
}

function Get-PythonCommand {
    foreach ($candidate in @("python", "py")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }
    return $null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$buildLogDir = Join-Path $repoRoot "build-logs\build-and-test-all"
$backendScriptDir = Join-Path $repoRoot "scripts\build-and-test-backend"
$frontendScriptDir = Join-Path $repoRoot "scripts\build-and-test-frontend"
$backendScript = Join-Path $backendScriptDir "build-and-test-backend.ps1"
$frontendScript = Join-Path $frontendScriptDir "build-and-test-frontend.ps1"

if (-not (Test-Path $buildLogDir)) {
    New-Item -ItemType Directory -Path $buildLogDir | Out-Null
}

Write-Log "========================================"
Write-Log "Full Pipeline: Build and Test All"
Write-Log "========================================"
Write-Log ""
Write-Log "This script will:"
Write-Log "  1. Run backend pipeline (all backend services)"
Write-Log "  2. Run frontend pipeline (crm-ui)"
Write-Log "  3. Generate aggregated coverage report"
Write-Log ""

$hasFailures = $false
$backendStatus = "PASS"
$frontendStatus = "PASS"

# ========================
# Step 1: Run Backend Pipeline
# ========================
Write-Log "========================================"
Write-Log "Step 1: Running Backend Pipeline"
Write-Log "========================================"
Write-Log ""

if (Test-Path $backendScript) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backendScript
        if ($LASTEXITCODE -ne 0) {
            throw "Backend pipeline failed with exit code $LASTEXITCODE"
        }
        Write-Log "Backend pipeline completed successfully"
    }
    catch {
        $backendStatus = "FAIL"
        $hasFailures = $true
        Write-Log "Backend pipeline failed: $($_.Exception.Message)"
    }
}
else {
    $backendStatus = "SKIP"
    Write-Log "Backend pipeline script not found: $backendScript"
}

Write-Log ""

# ========================
# Step 2: Run Frontend Pipeline
# ========================
Write-Log "========================================"
Write-Log "Step 2: Running Frontend Pipeline"
Write-Log "========================================"
Write-Log ""

if (Test-Path $frontendScript) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $frontendScript
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend pipeline failed with exit code $LASTEXITCODE"
        }
        Write-Log "Frontend pipeline completed successfully"
    }
    catch {
        $frontendStatus = "FAIL"
        $hasFailures = $true
        Write-Log "Frontend pipeline failed: $($_.Exception.Message)"
    }
}
else {
    $frontendStatus = "SKIP"
    Write-Log "Frontend pipeline script not found: $frontendScript"
}

Write-Log ""

# ========================
# Step 3: Generate Aggregated Coverage Report
# ========================
Write-Log "========================================"
Write-Log "Step 3: Generating Aggregated Coverage Report"
Write-Log "========================================"
Write-Log ""

$pythonCommand = Get-PythonCommand
$aggregatedCoverageGenerator = Join-Path $scriptDir "generate-aggregated-coverage-index.py"

if ($pythonCommand -and (Test-Path $aggregatedCoverageGenerator)) {
    try {
        Write-Log "Generating aggregated coverage report (build-logs/build-and-test-all/index.html)"
        $oldNoBytecode = $env:PYTHONDONTWRITEBYTECODE
        $env:PYTHONDONTWRITEBYTECODE = "1"
        & $pythonCommand $aggregatedCoverageGenerator
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Warning: Aggregated coverage index generation failed (exitCode=$LASTEXITCODE)."
        }
        else {
            Write-Log "Aggregated coverage report generated successfully"
        }
        $env:PYTHONDONTWRITEBYTECODE = $oldNoBytecode
    }
    catch {
        Write-Log "Warning: Aggregated coverage index generation failed: $($_.Exception.Message)"
    }
}
else {
    if (-not $pythonCommand) {
        Write-Log "Skipping aggregated coverage report generation: Python not available."
    }
    elseif (-not (Test-Path $aggregatedCoverageGenerator)) {
        Write-Log "Skipping aggregated coverage report generation: Generator script not found."
    }
}

Write-Log ""

# ========================
# Final Summary
# ========================
Write-Log "========================================"
Write-Log "Full Pipeline Summary"
Write-Log "========================================"
Write-Log ""

$summaryTable = @(
    [PSCustomObject]@{ Component = "Backend"; Status = $backendStatus }
    [PSCustomObject]@{ Component = "Frontend"; Status = $frontendStatus }
)

$summaryTable | Format-Table -AutoSize

Write-Log ""
Write-Log "Coverage Reports:"
Write-Log "  - Aggregated:  $buildLogDir\index.html"
Write-Log "  - Backend:     $(Join-Path $repoRoot "build-logs\build-and-test-backend\index.html")"
Write-Log "  - Frontend:    $(Join-Path $repoRoot "services\frontend\crm-ui\coverage\index.html")"
Write-Log ""

if ($hasFailures) {
    Write-Log "Status: FAIL - One or more pipelines failed"
    Exit-WithCode -Code 1
}
else {
    Write-Log "Status: PASS - All pipelines completed successfully"
    Exit-WithCode -Code 0
}
