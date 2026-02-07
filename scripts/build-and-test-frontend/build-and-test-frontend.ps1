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
    $logDir = Join-Path $repoRoot "build-logs\build-and-test-frontend"
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
    # This prevents mojibake when npm/vite/playwright output UTF-8 characters.
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

# Ensure native commands (npm/node) are handled via exit codes.
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

function Get-NodeCommand {
    foreach ($candidate in @("node")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }
    return $null
}

function Get-NpmCommand {
    foreach ($candidate in @("npm")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }
    return $null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$buildLogDir = Join-Path $repoRoot "build-logs\build-and-test-frontend"
$frontendRoot = Join-Path $repoRoot "services\frontend\crm-ui"

if (-not (Test-Path $frontendRoot)) {
    Write-Log "Frontend directory not found: $frontendRoot"
    Exit-WithCode -Code 1
}

$nodeCommand = Get-NodeCommand
if (-not $nodeCommand) {
    Write-Log "Node.js not found in PATH. Please install Node.js."
    Exit-WithCode -Code 1
}

$npmCommand = Get-NpmCommand
if (-not $npmCommand) {
    Write-Log "npm not found in PATH. Please install npm."
    Exit-WithCode -Code 1
}

Write-Log "Node version: $(& $nodeCommand --version)"
Write-Log "npm version: $(& $npmCommand --version)"

Write-Log "==> Frontend: crm-ui"
Write-Log "Location: $frontendRoot"

Push-Location $frontendRoot
$hasFailures = $false

try {
    # Step 1: Install dependencies
    Write-Log "[crm-ui] Installing dependencies (npm install)..."
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    Write-Log "[crm-ui] Dependencies installed successfully"

    # Step 2: Type checking
    Write-Log "[crm-ui] Running type checking (npm run typecheck)..."
    & $npmCommand run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw "Type checking failed"
    }
    Write-Log "[crm-ui] Type checking passed"

    # Step 3: Linting
    Write-Log "[crm-ui] Running linter (npm run lint)..."
    & $npmCommand run lint
    if ($LASTEXITCODE -ne 0) {
        throw "Linting failed"
    }
    Write-Log "[crm-ui] Linting passed"

    # Step 4: Format check and auto-fix
    Write-Log "[crm-ui] Running format check (npm run format:check)..."
    & $npmCommand run format:check
    if ($LASTEXITCODE -ne 0) {
        Write-Log "[crm-ui] Format check failed - attempting auto-fix..."
        Write-Log "[crm-ui] Running format fix (npm run format)..."
        & $npmCommand run format
        if ($LASTEXITCODE -ne 0) {
            throw "Format auto-fix failed"
        }
        Write-Log "[crm-ui] Format auto-fix completed - re-running format check..."
        & $npmCommand run format:check
        if ($LASTEXITCODE -ne 0) {
            throw "Format check failed after auto-fix"
        }
        Write-Log "[crm-ui] Format check passed after auto-fix"
    } else {
        Write-Log "[crm-ui] Format check passed"
    }

    # Step 5: Build
    Write-Log "[crm-ui] Building application (npm run build)..."
    & $npmCommand run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    Write-Log "[crm-ui] Build successful"

    # Step 6: Run tests with coverage
    Write-Log "[crm-ui] Running tests with coverage (npm run test:coverage)..."
    & $npmCommand run test:coverage
    if ($LASTEXITCODE -ne 0) {
        throw "Tests failed"
    }
    Write-Log "[crm-ui] Tests passed"

    # Step 7: Install Playwright browsers
    Write-Log "[crm-ui] Installing Playwright browsers (npx playwright install --with-deps)..."
    & npx playwright install --with-deps
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright browser installation failed"
    }
    Write-Log "[crm-ui] Playwright browsers installed successfully"

    # Step 8: Run end-to-end tests
    Write-Log "[crm-ui] Running end-to-end tests (npm run e2e)..."
    & $npmCommand run e2e
    if ($LASTEXITCODE -ne 0) {
        throw "E2E tests failed"
    }
    Write-Log "[crm-ui] E2E tests passed"

    Write-Log "[crm-ui] Local pipeline passed"
}
catch {
    $hasFailures = $true
    Write-Log "[crm-ui] Local pipeline failed: $($_.Exception.Message)"
}
finally {
    Pop-Location
}

Write-Host ""
Write-Log "Frontend local test pipeline summary"
if ($hasFailures) {
    Write-Log "Status: FAIL"
} else {
    Write-Log "Status: PASS"
}

# Generate aggregated report index
try {
    $reportIndexGenerator = Join-Path $repoRoot "scripts\build-and-test-frontend\generate-frontend-index.py"
    if (Test-Path $reportIndexGenerator) {
        $pythonCommand = $null
        foreach ($candidate in @("python", "py", "python3")) {
            if (Get-Command $candidate -ErrorAction SilentlyContinue) {
                $pythonCommand = $candidate
                break
            }
        }

        if ($pythonCommand) {
            Write-Log "Generating aggregated test report index..."
            $oldBuildLogDir = $env:BUILD_LOG_DIR
            $env:BUILD_LOG_DIR = $buildLogDir
            & $pythonCommand $reportIndexGenerator
            $env:BUILD_LOG_DIR = $oldBuildLogDir
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Report index generation failed (exitCode=$LASTEXITCODE)."
            }
        }
        else {
            Write-Log "Skipping aggregated report index generation: Python not available."
        }
    }
}
catch {
    Write-Log "Report index generation failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Log "All test reports aggregated at:"
Write-Log "  - HTML: $buildLogDir\index.html"
Write-Log "  - Open in browser: file:///$($buildLogDir.Replace('\', '/'))/index.html"

Write-Host ""
Write-Log "Individual reports:"
Write-Log "  - Vitest coverage: $frontendRoot\coverage\index.html"
Write-Log "  - Playwright e2e: $frontendRoot\playwright-report\index.html"

if ($hasFailures) {
    Write-Log "Frontend local pipeline checks failed."
    Exit-WithCode -Code 1
}

Write-Log "Frontend passed lint, build, tests, coverage, and e2e tests."
Exit-WithCode -Code 0
