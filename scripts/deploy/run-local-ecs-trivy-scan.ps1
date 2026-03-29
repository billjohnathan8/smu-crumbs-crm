param(
    [string[]]$Services = @('user', 'client', 'transaction'),
    [string]$Tag = 'local',
    [switch]$SkipBuild,
    [switch]$UseDockerTrivy
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$backendRoot = Join-Path $repoRoot 'services\backend'

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Command)

    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists -Command 'docker')) {
    throw 'docker is required but was not found in PATH.'
}

$trivyViaDocker = $UseDockerTrivy.IsPresent
if (-not $trivyViaDocker) {
    if (-not (Test-CommandExists -Command 'trivy')) {
        Write-Host 'trivy CLI was not found; falling back to Docker-based trivy.' -ForegroundColor Yellow
        $trivyViaDocker = $true
    }
}

$allowed = @('user', 'client', 'transaction')
$invalid = $Services | Where-Object { $_ -notin $allowed }
if ($invalid) {
    throw "Unsupported service(s): $($invalid -join ', '). Allowed values: $($allowed -join ', ')."
}

$failed = @()

foreach ($service in $Services) {
    $serviceDir = Join-Path $backendRoot $service
    if (-not (Test-Path $serviceDir)) {
        throw "Missing service directory: $serviceDir"
    }

    $imageRef = "local/${service}:$Tag"

    Write-Host "`n=== [$service] Build ===" -ForegroundColor Cyan
    if (-not $SkipBuild.IsPresent) {
        Push-Location $serviceDir
        try {
            if (-not (Test-Path '.\gradlew')) {
                throw "gradlew not found in $serviceDir"
            }
            & .\gradlew clean bootJar -x test --no-daemon --console=plain
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host "Skipping Gradle build for $service" -ForegroundColor Yellow
    }

    Write-Host "=== [$service] Docker Build ($imageRef) ===" -ForegroundColor Cyan
    docker build --no-cache -t $imageRef $serviceDir

    Write-Host "=== [$service] Trivy Scan ===" -ForegroundColor Cyan
    $scanFailed = $false

    if ($trivyViaDocker) {
        docker run --rm -v //var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --format table --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 $imageRef

        if ($LASTEXITCODE -ne 0) {
            $scanFailed = $true
        }
    }
    else {
        trivy image --format table --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 $imageRef

        if ($LASTEXITCODE -ne 0) {
            $scanFailed = $true
        }
    }

    if ($scanFailed) {
        $failed += $service
        Write-Host "[$service] Trivy failed." -ForegroundColor Red
    }
    else {
        Write-Host "[$service] Trivy passed." -ForegroundColor Green
    }
}

if ($failed.Count -gt 0) {
    throw "Trivy scan failed for service(s): $($failed -join ', ')"
}

Write-Host "`nAll requested services passed Trivy HIGH/CRITICAL gate." -ForegroundColor Green
