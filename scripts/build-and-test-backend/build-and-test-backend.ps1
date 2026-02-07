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
    $logDir = Join-Path $repoRoot "build-logs\\build-and-test-backend"
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
    # This prevents mojibake when gradle/python output UTF-8 characters.
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

function Get-ServiceType {
    param([string]$ServicePath)

    if (Test-Path (Join-Path $ServicePath "gradlew.bat")) {
        return "gradle"
    }

    if (Test-Path (Join-Path $ServicePath "run-local-test-pipeline.py")) {
        return "python"
    }

    return $null
}

function Get-PythonCommand {
    foreach ($candidate in @("python", "py")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }

    return $null
}

function Ensure-GradleUserHome {
    param(
        [string]$RepoRoot,
        [string]$GradleUserHome
    )

    if (-not (Test-Path $GradleUserHome)) {
        New-Item -ItemType Directory -Path $GradleUserHome | Out-Null
    }

    $destDists = Join-Path $GradleUserHome "wrapper\\dists"
    $srcDists = Join-Path (Join-Path $RepoRoot ".gradle-user-home") "wrapper\\dists"

    # In sandboxed environments, Gradle Wrapper downloads may be blocked.
    # Bootstrap a clean-ish GRADLE_USER_HOME with already-cached wrapper dists if available.
    if (-not (Test-Path $srcDists)) {
        return
    }

    $needsBootstrap = $false
    if (-not (Test-Path $destDists)) {
        $needsBootstrap = $true
    }
    else {
        $partial = @(Get-ChildItem -Path $destDists -Recurse -Force -Filter "*.zip.part" -ErrorAction SilentlyContinue)
        if ($partial.Count -gt 0) {
            $needsBootstrap = $true
        }
    }

    if ($needsBootstrap) {
        Write-Log "Bootstrapping Gradle wrapper dists into $GradleUserHome"
        New-Item -ItemType Directory -Path $destDists -Force | Out-Null
        Copy-Item -Recurse -Force (Join-Path $srcDists "*") $destDists
    }
}

function Test-GradleReportsPresent {
    param([string]$ServicePath)

    $expected = @(
        (Join-Path $ServicePath "build\\reports\\jacoco\\test\\jacocoTestReport.xml"),
        (Join-Path $ServicePath "build\\reports\\jacoco\\test\\html\\index.html"),
        (Join-Path $ServicePath "build\\reports\\tests\\test\\index.html"),
        (Join-Path $ServicePath "build\\reports\\checkstyle\\main.html"),
        (Join-Path $ServicePath "build\\reports\\checkstyle\\test.html")
    )

    foreach ($path in $expected) {
        if (-not (Test-Path $path)) {
            return $false
        }
    }
    return $true
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$buildLogDir = Join-Path $repoRoot "build-logs\\build-and-test-backend"
$backendRoot = Join-Path $repoRoot "services\backend"
$gradleUserHome = Join-Path $repoRoot ".gradle-user-home-backend-pipeline"

if (-not (Test-Path $backendRoot)) {
    Write-Log "Backend services directory not found: $backendRoot"
    Exit-WithCode -Code 1
}

if (-not (Test-Path $gradleUserHome)) {
    New-Item -ItemType Directory -Path $gradleUserHome | Out-Null
}

Ensure-GradleUserHome -RepoRoot $repoRoot -GradleUserHome $gradleUserHome

$env:GRADLE_USER_HOME = $gradleUserHome

$services = @(Get-ChildItem -Path $backendRoot -Directory | ForEach-Object {
    $serviceType = Get-ServiceType -ServicePath $_.FullName
    if ($null -ne $serviceType) {
        [PSCustomObject]@{
            Name        = $_.Name
            FullName    = $_.FullName
            ServiceType = $serviceType
        }
    }
} | Sort-Object Name)

if (-not $services) {
    Write-Log "No supported backend services found under $backendRoot"
    Exit-WithCode -Code 1
}

$pythonCommand = Get-PythonCommand
$pythonServices = @($services | Where-Object { $_.ServiceType -eq "python" })
if ($pythonServices.Count -gt 0 -and -not $pythonCommand) {
    Write-Log "Python service(s) detected but no Python runtime found in PATH."
    Exit-WithCode -Code 1
}

Write-Log "Discovered $($services.Count) backend service(s):"
foreach ($service in $services) {
    Write-Log "  - $($service.Name) [$($service.ServiceType)]"
}

$results = @()
$hasFailures = $false

foreach ($service in $services) {
    $serviceName = $service.Name
    $servicePath = $service.FullName
    $serviceType = $service.ServiceType
    $status = "PASS"

    Write-Log "==> Service: $serviceName [$serviceType]"

    Push-Location $servicePath
    try {
        if ($serviceType -eq "gradle") {
            & .\gradlew.bat localTestPipeline --no-daemon --console=plain --gradle-user-home "$gradleUserHome"
            if ($LASTEXITCODE -ne 0) {
                throw "localTestPipeline failed"
            }

            if (-not (Test-GradleReportsPresent -ServicePath $servicePath)) {
                Write-Log "[$serviceName] Expected Gradle reports missing; rerunning report tasks with --rerun-tasks"
                & .\gradlew.bat checkstyleMain checkstyleTest test jacocoTestReport --no-daemon --console=plain --gradle-user-home "$gradleUserHome" --rerun-tasks
                if ($LASTEXITCODE -ne 0) {
                    throw "report regeneration failed"
                }
            }
        }
        elseif ($serviceType -eq "python") {
            & $pythonCommand "run-local-test-pipeline.py"
            if ($LASTEXITCODE -ne 0) {
                throw "run-local-test-pipeline.py failed"
            }
        }
        else {
            throw "Unsupported service type '$serviceType'"
        }

        Write-Log "[$serviceName] Local pipeline passed"
    }
    catch {
        $status = "FAIL"
        $hasFailures = $true
        Write-Log "[$serviceName] Local pipeline failed: $($_.Exception.Message)"
    }
    finally {
        Pop-Location
    }

    $results += [PSCustomObject]@{
        Service = $serviceName
        Runtime = $serviceType
        Status  = $status
    }
}

Write-Host ""
Write-Log "Backend local test pipeline summary"
$results | Format-Table -AutoSize

try {
    $coverageIndexGenerator = Join-Path $repoRoot "scripts\build-and-test-backend\generate-coverage-index.py"
    if (Test-Path $coverageIndexGenerator) {
        $pythonForReport = $pythonCommand
        if (-not $pythonForReport) {
            $pythonForReport = Get-PythonCommand
        }

        if ($pythonForReport) {
            Write-Log "Generating aggregated coverage report (build-logs/build-and-test-backend/index.html)"
            $oldNoBytecode = $env:PYTHONDONTWRITEBYTECODE
            $env:PYTHONDONTWRITEBYTECODE = "1"
            $oldBuildLogDir = $env:BUILD_LOG_DIR
            $env:BUILD_LOG_DIR = $buildLogDir
            & $pythonForReport $coverageIndexGenerator
            $env:BUILD_LOG_DIR = $oldBuildLogDir
            $env:PYTHONDONTWRITEBYTECODE = $oldNoBytecode
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Coverage index generation failed (exitCode=$LASTEXITCODE)."
            }
        }
        else {
            Write-Log "Skipping aggregated coverage report generation: Python not available."
        }
    }
}
catch {
    Write-Log "Coverage index generation failed: $($_.Exception.Message)"
}

if ($hasFailures) {
    Write-Log "One or more services failed local pipeline checks."
    Exit-WithCode -Code 1
}

Write-Log "All backend services passed lint, build, tests, and coverage report generation."
Exit-WithCode -Code 0
