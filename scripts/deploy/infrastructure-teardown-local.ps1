[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("lab", "prod")]
    [string]$Env,

    [Parameter(Mandatory = $true)]
    [string]$RootAdminPassword,

    [string]$JwtHmacSecret,
    [string]$AwsLabRoleArn,
    [string]$Profile,

    [string]$AwsAccessKeyId,
    [string]$AwsSecretAccessKey,
    [string]$AwsSessionToken,

    [switch]$TombstoneSsm
)

Write-Host "`n--- DEBUG START ---" -ForegroundColor Yellow
Write-Host "[DEBUG] Raw Args: $($args -join ' | ')"
Write-Host "[DEBUG] Bound Parameters: $(($PSBoundParameters.Keys | ForEach-Object { "$_=$($PSBoundParameters[$_])" }) -join ', ')"
Write-Host "[DEBUG] Command Line: $($MyInvocation.Line)"
if ($PSCmdlet) { 
    Write-Host "[DEBUG] Parameter Set: $($PSCmdlet.ParameterSetName)" 
}
Write-Host "--- DEBUG END ---\n" -ForegroundColor Yellow
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$tfDir = Join-Path $repoRoot "platform\terraform"
$deployScript = Join-Path $scriptDir "deploy-aws.ps1"
$artifactDir = Join-Path $tfDir "local-artifacts"

function Invoke-Aws {
    param(
        [string[]]$AwsArgs,
        [switch]$AllowFailure,
        [switch]$CaptureOutput
    )

    $full = @()
    if ($Profile) {
        $full += @("--profile", $Profile)
    }
    $full += $AwsArgs
    $full = @($full | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($full.Count -eq 0) {
        throw "AWS command failed: no arguments supplied"
    }

    $out = $null
    $code = 0
    $stderrText = ""
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $proc = Start-Process -FilePath "aws" `
            -ArgumentList $full `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        $code = $proc.ExitCode

        if ($CaptureOutput -and (Test-Path $stdoutFile)) {
            $out = Get-Content -LiteralPath $stdoutFile -Raw
        }
        if (Test-Path $stderrFile) {
            $stderrText = Get-Content -LiteralPath $stderrFile -Raw
        }
    } finally {
        if (Test-Path $stdoutFile) {
            Remove-Item -LiteralPath $stdoutFile -ErrorAction SilentlyContinue
        }
        if (Test-Path $stderrFile) {
            Remove-Item -LiteralPath $stderrFile -ErrorAction SilentlyContinue
        }
    }

    if ($code -ne 0 -and -not $AllowFailure) {
        $errSuffix = ""
        if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
            $errSuffix = ": " + $stderrText.Trim()
        }
        throw ("AWS command failed: aws " + ($full -join " ") + " (exit $code)" + $errSuffix)
    }

    if ($CaptureOutput) { return ,$out }
    return $code
}

if ($AwsAccessKeyId) { $env:AWS_ACCESS_KEY_ID = $AwsAccessKeyId }
if ($AwsSecretAccessKey) { $env:AWS_SECRET_ACCESS_KEY = $AwsSecretAccessKey }
if ($AwsSessionToken) { $env:AWS_SESSION_TOKEN = $AwsSessionToken }

$env:TF_VAR_root_admin_password = $RootAdminPassword
if ($JwtHmacSecret) { $env:TF_VAR_jwt_hmac_secret = $JwtHmacSecret }
if ($AwsLabRoleArn) { $env:TF_VAR_lab_role_arn = $AwsLabRoleArn }

& $deployScript -Env $Env -Destroy -AutoApprove
if ($LASTEXITCODE -ne 0) {
    throw "deploy-aws.ps1 destroy failed"
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportPath = Join-Path $artifactDir "ssm-cleanup-report-$Env-$stamp.json"

$basePath = "/scroogebank-crm/$Env/deploy"
$keys = @(
    "aws-region",
    "ecs/cluster-name",
    "ecr/repository-urls",
    "ecr/repository-names",
    "codedeploy/ecs/application-name",
    "codedeploy/ecs/deployment-groups",
    "codedeploy/lambda/application-name",
    "codedeploy/lambda/deployment-groups",
    "lambda/function-names",
    "frontend/s3-bucket",
    "frontend/cloudfront-distribution-id",
    "frontend/app-url"
)

$removed = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]

foreach ($key in $keys) {
    $full = "$basePath/$key"
    $exists = (Invoke-Aws -AwsArgs @("ssm", "get-parameter", "--name", $full) -AllowFailure) -eq 0
    if ($exists) {
        [void](Invoke-Aws -AwsArgs @("ssm", "delete-parameter", "--name", $full))
        $removed.Add($full)
    } else {
        $missing.Add($full)
    }
}

if ($TombstoneSsm) {
    $ts = (Get-Date).ToUniversalTime().ToString("o")
    [void](Invoke-Aws -AwsArgs @(
        "ssm", "put-parameter",
        "--name", "$basePath/status",
        "--type", "String",
        "--overwrite",
        "--value", "destroyed:$ts"
    ))
}

$report = [ordered]@{
    environment = $Env
    cleaned_at = (Get-Date).ToUniversalTime().ToString("o")
    tombstone_enabled = [bool]$TombstoneSsm
    removed_keys = @($removed)
    missing_keys = @($missing)
}

$report | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $reportPath

Write-Host "[DONE] InfrastructureTeardown local test complete"
Write-Host "[INFO] SSM cleanup report: $reportPath"
