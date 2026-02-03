Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Ensure native commands (make/kubectl/docker) are handled via exit codes.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
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

function Test-KindClusterExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClusterName
    )

    $clusters = & kind get clusters 2>$null
    if ($LASTEXITCODE -ne 0) {
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

if (-not (Get-Command make -ErrorAction SilentlyContinue)) {
    Write-Log "Missing dependency: 'make' is not installed or not in PATH."
    exit 1
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
    $kindClusterName = Get-KindClusterName -RepoRoot $repoRoot
    $bashPath = Get-BashPath
    if ($env:OS -eq "Windows_NT" -and -not $bashPath) {
        throw "Git Bash was not found. Install Git for Windows so make recipes run correctly on Windows."
    }

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
}
finally {
    Pop-Location
}

Write-Log "Local Kubernetes build/deploy and smoke checks completed successfully."
exit 0
