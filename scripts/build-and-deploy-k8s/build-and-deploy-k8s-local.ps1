Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:SCRIPT_RUN_LOG_CAPTURED) {
    $scriptPath = $PSCommandPath
    $scriptName = [System.IO.Path]::GetFileNameWithoutExtension($scriptPath)
    $scriptDir = Split-Path -Parent $scriptPath
    $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
    $logDir = Join-Path $repoRoot "build-logs\\build-and-deploy-k8s"
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

    # IMPORTANT: This wrapper process captures output from a child PowerShell process and writes it to the console/log.
    # On Windows PowerShell 5.1, external process output decoding is tied to the wrapper's console encodings/codepage.
    # Set UTF-8 here (the script exits from this block and would not reach the later encoding setup).
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

    function Repair-ConsoleMojibake {
        param(
            [AllowNull()]
            [AllowEmptyString()]
            [string]$Text
        )

        if ([string]::IsNullOrEmpty($Text)) {
            return $Text
        }

        # Some native tools output UTF-8, but Windows PowerShell 5.1 can decode using an OEM code page (often 850),
        # producing mojibake. Re-encode as OEM 850 bytes and decode as UTF-8 to recover the intended Unicode text.
        try {
            $oem850 = [System.Text.Encoding]::GetEncoding(850)
            $bytes = $oem850.GetBytes($Text)
            $fixed = [System.Text.Encoding]::UTF8.GetString($bytes)

            # If conversion produced replacement chars, keep the original.
            if ($fixed.IndexOf([char]0xFFFD) -ge 0) {
                return $Text
            }

            # Only accept the fix when it reduces common mojibake markers.
            $markerChars = @([char]0x00D4, [char]0x00C3, [char]0x0192) # D4=O-circumflex, C3=A-tilde, 0192=Latin small f
            $origMarkers = ($Text.ToCharArray() | Where-Object { $markerChars -contains $_ }).Count
            $fixedMarkers = ($fixed.ToCharArray() | Where-Object { $markerChars -contains $_ }).Count
            if ($fixedMarkers -lt $origMarkers) {
                return $fixed
            }

            return $Text
        }
        catch {
            return $Text
        }
    }

    function Remove-AnsiEscapeCodes {
        param([string]$Text)
        # Remove ANSI escape sequences (colors, cursor movement, formatting, etc.)
        # Pattern matches: ESC [ ... m (colors/formatting) and ESC [ ... (cursor control)
        $Text -replace '\x1b\[[0-9;]*[a-zA-Z]', '' -replace '\x1b\([B0]', ''
    }

    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir | Out-Null
    }

    $env:SCRIPT_RUN_LOG_CAPTURED = "1"
    $env:BUILD_LOG_FILE = $logFile

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
                        # Preserve the original stderr line from native tools (kind/helm/etc.) without printing ErrorRecord metadata.
                        Repair-ConsoleMojibake -Text ($_.Exception.Message)
                    }
                    else {
                        Repair-ConsoleMojibake -Text ($_.ToString())
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

# Ensure native commands (make/kubectl/docker) are handled via exit codes.
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
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

if ($env:BUILD_LOG_FILE) {
    Write-Log "Build log file: $($env:BUILD_LOG_FILE)"
}

function Invoke-MakeTarget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [Parameter(Mandatory = $false)]
        [string]$BashPath
    )

    Write-Log "Running: make $Target"
    if ($env:OS -eq "Windows_NT" -and $BashPath) {
        # Force GNU Make recipes to run under Git Bash on Windows.
        # Also pin Unix-friendly variables for this execution path.
        $bashForMake = $BashPath -replace "\\", "/"
        & make "SHELL=$bashForMake" "NULL_DEVICE=/dev/null" "GRADLEW=./gradlew" $Target
    }
    else {
        & make $Target
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: make $Target"
    }
}

function Get-BashPath {
    $candidatePaths = @(
        "C:\Program Files\Git\bin\bash.exe",
        "C:\Program Files\Git\usr\bin\bash.exe",
        "C:\Program Files\Git\bin\sh.exe",
        "C:\Program Files\Git\usr\bin\sh.exe"
    )

    foreach ($path in $candidatePaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    $bashCommand = Get-Command bash -ErrorAction SilentlyContinue
    if ($bashCommand) {
        $source = $bashCommand.Source
        if ($env:OS -eq "Windows_NT" -and $source -match "\\Windows\\System32\\bash.exe$") {
            return $null
        }
        return $source
    }

    return $null
}

function Get-KindClusterName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $kindConfigPath = Join-Path $RepoRoot "platform/k8s/infra/kind-config.yaml"
    if (-not (Test-Path $kindConfigPath)) {
        return "cs301-crm"
    }

    $nameLine = Get-Content $kindConfigPath | Where-Object { $_ -match '^\s*name:\s*' } | Select-Object -First 1
    if (-not $nameLine) {
        return "cs301-crm"
    }

    return (($nameLine -replace '^\s*name:\s*', '').Trim())
}

function Get-K8sDeploymentNames {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $kustomizationPath = Join-Path $RepoRoot "platform/k8s/apps/base/kustomization.yaml"
    if (-not (Test-Path $kustomizationPath)) {
        return @()
    }

    $deployments = @()
    foreach ($line in Get-Content $kustomizationPath) {
        if ($line -match '^\s*-\s*(.+-deployment\.yaml)\s*$') {
            $deployments += ($Matches[1] -replace '-deployment\.yaml$', '')
        }
    }

    return $deployments
}

function Test-DockerAvailable {
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            return $false
        }

        & docker info *> $null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

function Test-KindClusterExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClusterName
    )

    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $clusters = & kind get clusters 2>$null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldEap
    }

    if ($exitCode -ne 0) {
        return $false
    }

    return ($clusters -contains $ClusterName)
}

function Test-KindClusterReachable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClusterName
    )

    $contextName = "kind-$ClusterName"
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & kubectl --context $contextName version --request-timeout=10s *> $null
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

function Initialize-KindCluster {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClusterName,
        [Parameter(Mandatory = $false)]
        [string]$BashPath
    )

    $clusterExists = Test-KindClusterExists -ClusterName $ClusterName
    if (-not $clusterExists) {
        Invoke-MakeTarget -Target "kind-up" -BashPath $BashPath
        return
    }

    if (Test-KindClusterReachable -ClusterName $ClusterName) {
        Write-Log "kind cluster '$ClusterName' already exists and is reachable; skipping make kind-up."
        return
    }

    Write-Log "kind cluster '$ClusterName' exists but is unreachable; recreating."
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & kind delete cluster --name $ClusterName *> $null
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
    Invoke-MakeTarget -Target "kind-up" -BashPath $BashPath
}

function Invoke-TeardownAfterSuccess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClusterName
    )

    Write-Log "Smoke passed: tearing down local k8s resources and kind cluster '$ClusterName'"

    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # 1) Remove app workloads (best-effort).
        & kubectl delete -k platform/k8s/apps/overlays/dev --ignore-not-found *> $null

        # 2) Remove infra components (best-effort).
        & helm uninstall postgres -n dev *> $null
        & helm uninstall ingress-nginx -n ingress-nginx *> $null
        & helm uninstall metrics-server -n kube-system *> $null

        # 3) Delete kind cluster (required for a complete teardown).
        & kind delete cluster --name $ClusterName *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to delete kind cluster '$ClusterName'."
        }

        Write-Log "Teardown complete: kind cluster '$ClusterName' deleted."
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

function Generate-K8sDeploySummaryReport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    if (-not $env:BUILD_LOG_FILE) {
        Write-Log "No BUILD_LOG_FILE environment variable set; skipping k8s deploy summary report generation."
        return
    }

    $logFile = $env:BUILD_LOG_FILE
    $logDir = Split-Path -Parent $logFile
    $summaryScript = Join-Path $RepoRoot "scripts\build-and-deploy-k8s\generate-k8s-deploy-summary.py"

    if (-not (Test-Path $summaryScript)) {
        Write-Log "K8s deploy summary generator script not found: $summaryScript"
        return
    }

    # Check if Python is available and actually works (not just the Windows stub)
    $pythonCmd = $null
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        foreach ($cmd in @("python3", "python")) {
            if (Get-Command $cmd -ErrorAction SilentlyContinue) {
                # Test if Python actually works (not the Windows Store stub)
                $testOutput = & $cmd --version 2>&1
                if ($LASTEXITCODE -eq 0 -and $testOutput -match 'Python \d+\.\d+') {
                    $pythonCmd = $cmd
                    break
                }
            }
        }
    }
    finally {
        $ErrorActionPreference = $oldEap
    }

    if (-not $pythonCmd) {
        Write-Log "Python not found or not working; skipping k8s deploy summary report generation."
        return
    }

    Write-Log "Generating comprehensive K8s deployment summary report..."
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $scriptOutput = & $pythonCmd $summaryScript $logFile $logDir 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            # Only show output if successful
            $scriptOutput | ForEach-Object { Write-Host $_ }
            Write-Log "K8s deployment summary report generated successfully."
            
            # Rotate old summary reports (keep most recent 3)
            $summaryFiles = @(
                Get-ChildItem -Path $logDir -File -Filter "summary-k8s-deploy__*.html" -ErrorAction SilentlyContinue |
                    Sort-Object LastWriteTime -Descending
            )
            if ($summaryFiles.Count -gt 3) {
                $summaryFiles | Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue
                Write-Log "Rotated old k8s deploy summary reports (kept 3 most recent)."
            }
            
            # Also generate the legacy probe diagnostics summary for backward compatibility
            $probeSummaryScript = Join-Path $RepoRoot "scripts\smoke-k8s-infra\generate-probe-summary.py"
            if (Test-Path $probeSummaryScript) {
                $probeOutput = & $pythonCmd $probeSummaryScript $logFile $logDir 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "Legacy probe diagnostics summary also generated."
                    
                    # Rotate old probe diagnostics reports (keep most recent 3)
                    $probeFiles = @(
                        Get-ChildItem -Path $logDir -File -Filter "probe-diagnostics-summary*.html" -ErrorAction SilentlyContinue |
                            Sort-Object LastWriteTime -Descending
                    )
                    if ($probeFiles.Count -gt 3) {
                        $probeFiles | Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
        else {
            # Python script failed - show error details
            Write-Log "Warning: Failed to generate k8s deploy summary report (exit code: $exitCode)."
            if ($scriptOutput) {
                Write-Log "Python script error output:"
                $scriptOutput | ForEach-Object { Write-Log "  $_" }
            }
        }
    }
    catch {
        Write-Log "Warning: Error generating k8s deploy summary report: $($_.Exception.Message)"
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
}

if (-not (Get-Command make -ErrorAction SilentlyContinue)) {
    Write-Log "Missing dependency: 'make' is not installed or not in PATH."
    Exit-WithCode -Code 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

$targets = @(
    "kind-up",
    "infra-up",
    "build-images",
    "kind-load",
    "deploy-dev",
    "smoke"
)

Push-Location $repoRoot
try {
    $completedSuccessfully = $false
    $deployments = Get-K8sDeploymentNames -RepoRoot $repoRoot
    if ($deployments.Count -gt 0) {
        Write-Log "Base kustomization deployments: $($deployments -join ', ')"
    }
    $kindClusterName = Get-KindClusterName -RepoRoot $repoRoot
    $bashPath = Get-BashPath
    if ($env:OS -eq "Windows_NT" -and -not $bashPath) {
        throw "Git Bash was not found. Install Git for Windows so make recipes run correctly on Windows."
    }

    if (-not (Test-DockerAvailable)) {
        throw "Docker is not available or the daemon is not running. Start Docker Desktop and retry."
    }

    Write-Log "Running K8s manifest validation..."
    Invoke-MakeTarget -Target "k8s-validate" -BashPath $bashPath
    Write-Log "K8s validation passed."

    Initialize-KindCluster -ClusterName $kindClusterName -BashPath $bashPath

    $contextName = "kind-$kindClusterName"
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & kubectl config use-context $contextName *> $null
    }
    finally {
        $ErrorActionPreference = $oldEap
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to switch kubectl context to '$contextName'."
    }

    foreach ($target in $targets) {
        if ($target -eq "kind-up") {
            continue
        }

        Invoke-MakeTarget -Target $target -BashPath $bashPath
    }

    $completedSuccessfully = $true
}
finally {
    # Generate comprehensive k8s deploy summary report (regardless of success/failure)
    try {
        Generate-K8sDeploySummaryReport -RepoRoot $repoRoot
    }
    catch {
        Write-Log "Warning: Failed to generate k8s deploy summary: $($_.Exception.Message)"
    }

    if ($completedSuccessfully) {
        try {
            Invoke-TeardownAfterSuccess -ClusterName $kindClusterName
        }
        catch {
            Write-Log "Teardown failed: $($_.Exception.Message)"
            Pop-Location
            Exit-WithCode -Code 1
        }
    }
    Pop-Location
}

Write-Log "Local Kubernetes build/deploy and smoke checks completed successfully."
Exit-WithCode -Code 0
