param(
    [string]$TargetUrl = "http://127.0.0.1:18088",
    [string]$ReportDir = $(Join-Path $PSScriptRoot "..\..\build-logs\zap"),
    [string]$DockerImage = "owasp/zap2docker-stable",
    [switch]$Authenticated,
    [string]$LoginEmail = "admin@crm.com",
    [string]$LoginPassword,
    [switch]$StartDevStack,
    [switch]$OpenReport,
    [int]$WaitTimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$stackScript = Join-Path $repoRoot "scripts\dev\stack-up.ps1"
$resolvedReportDir = Resolve-Path -Path $ReportDir -ErrorAction SilentlyContinue
if ($null -eq $resolvedReportDir) {
    $resolvedReportDir = New-Item -ItemType Directory -Force -Path $ReportDir
}

if ($Authenticated -and [string]::IsNullOrWhiteSpace($LoginPassword)) {
    $LoginPassword = [Environment]::GetEnvironmentVariable("E2E_ADMIN_PASSWORD")
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$htmlReport = "zap-baseline-$timestamp.html"
$jsonReport = "zap-baseline-$timestamp.json"
$htmlReportPath = Join-Path $resolvedReportDir $htmlReport
$jsonReportPath = Join-Path $resolvedReportDir $jsonReport

function Test-HttpEndpoint {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 10
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -ge 200
    }
    catch {
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            return $statusCode -ge 200 -and $statusCode -lt 500
        }

        return $false
    }
}

function Wait-ForEndpoint {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 300
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpEndpoint -Url $Url) {
            return
        }

        Start-Sleep -Seconds 5
    }

    throw "Target URL did not become reachable within $TimeoutSeconds seconds: $Url"
}

function Get-AccessToken {
    param(
        [string]$BaseUrl,
        [string]$Email,
        [string]$Password
    )

    if ([string]::IsNullOrWhiteSpace($Password)) {
        throw "Authenticated scan requires a login password. Pass -LoginPassword or set E2E_ADMIN_PASSWORD."
    }

    $loginResponse = Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + "/api/auth/login") -ContentType "application/json" -Body (@{
        email = $Email
        password = $Password
    } | ConvertTo-Json)

    if ([string]::IsNullOrWhiteSpace($loginResponse.accessToken)) {
        throw "Login succeeded but no accessToken was returned."
    }

    return $loginResponse.accessToken
}

if ($StartDevStack) {
    if (-not (Test-Path $stackScript)) {
        throw "Missing dev stack script: $stackScript"
    }

    Write-Host "Starting local dev stack..."
    & $stackScript
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Write-Host "Waiting for target URL: $TargetUrl"
Wait-ForEndpoint -Url $TargetUrl -TimeoutSeconds $WaitTimeoutSeconds

$zapOptions = @()
if ($Authenticated) {
    Write-Host "Logging in for authenticated scan as $LoginEmail..."
    $accessToken = Get-AccessToken -BaseUrl $TargetUrl -Email $LoginEmail -Password $LoginPassword
    $encodedToken = [System.Uri]::EscapeDataString("Bearer $accessToken")
    $zapOptions = @(
        "-z",
        "-config replacer.full_list(0).description=auth-bearer -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=Authorization -config replacer.full_list(0).replacement=$encodedToken -config replacer.full_list(0).url="
    )
}

Write-Host "Running OWASP ZAP baseline scan via Docker..."
$dockerArgs = @(
    "run",
    "--rm",
    "--pull",
    "always",
    "--user",
    "root",
    "--mount",
    "type=bind,source=$repoRoot,target=/zap/wrk",
    "-w",
    "/zap/wrk",
    $DockerImage,
    "zap-baseline.py",
    "-t",
    $TargetUrl,
    "-r",
    $htmlReport,
    "-J",
    $jsonReport
) + $zapOptions

& docker @dockerArgs
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "ZAP HTML report: $htmlReportPath"
Write-Host "ZAP JSON report: $jsonReportPath"

if ($OpenReport -and (Test-Path $htmlReportPath)) {
    Start-Process $htmlReportPath
}

exit $exitCode