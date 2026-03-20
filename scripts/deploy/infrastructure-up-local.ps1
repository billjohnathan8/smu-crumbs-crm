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

    [switch]$PlanOnly,
    [switch]$PublishSsm,
    [switch]$SyncDeployerRoleArn
)

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

if ($PlanOnly) {
    & $deployScript -Env $Env -PlanOnly
} else {
    & $deployScript -Env $Env -AutoApprove
}
if ($LASTEXITCODE -ne 0) { throw "deploy-aws.ps1 failed" }

if ($PlanOnly) {
    Write-Host "[DONE] Plan-only run completed"
    exit 0
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputJson = Join-Path $artifactDir "terraform-output-$Env-$stamp.json"
$snapshotJson = Join-Path $artifactDir "deploy-contract-snapshot-$Env-$stamp.json"

Push-Location $tfDir
try {
    terraform output -json | Out-File -Encoding utf8 $outputJson

    $tf = Get-Content $outputJson -Raw | ConvertFrom-Json
    $snapshot = [ordered]@{
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        environment = $Env
        deploy_contract = [ordered]@{
            aws_region = $env:AWS_DEFAULT_REGION
            ecs_cluster_name = $tf.ecs_cluster_name.value
            ecr_repository_urls = $tf.ecr_repository_urls.value
            ecr_repository_names = $tf.ecr_repository_names.value
            codedeploy_ecs_application_name = $tf.codedeploy_ecs_application_name.value
            codedeploy_ecs_deployment_group_names = $tf.codedeploy_ecs_deployment_group_names.value
            codedeploy_lambda_application_name = $tf.codedeploy_lambda_application_name.value
            codedeploy_lambda_deployment_group_names = $tf.codedeploy_lambda_deployment_group_names.value
            lambda_function_names = [ordered]@{
                log = $tf.log_lambda_name.value
                aml = $tf.aml_lambda_name.value
                transaction_ingestion = $tf.transaction_ingestion_lambda_name.value
                verification = $tf.verification_lambda_name.value
            }
            frontend_bucket_name = $tf.frontend_bucket_name.value
            cloudfront_distribution_id = $tf.cloudfront_distribution_id.value
            cloudfront_distribution_domain_name = $tf.cloudfront_distribution_domain_name.value
            app_url = $tf.app_url.value
            alb_dns_name = $tf.alb_dns_name.value
            frontend_website_url = $tf.frontend_website_url.value
            cognito_user_pool_id = $tf.cognito_user_pool_id.value
            cognito_app_client_id = $tf.cognito_app_client_id.value
            deployer_role_arn = $tf.deployer_role_arn.value
        }
    }

    $snapshot | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 $snapshotJson

    if ($PublishSsm) {
        $basePath = "/scroogebank-crm/$Env/deploy"

        $put = {
            param([string]$Key, [string]$Value)
            if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "null") { return }
            [void](Invoke-Aws -AwsArgs @(
                "ssm", "put-parameter",
                "--name", "$basePath/$Key",
                "--type", "String",
                "--overwrite",
                "--value", $Value
            ))
        }

        & $put "aws-region" $env:AWS_DEFAULT_REGION
        & $put "ecs/cluster-name" $tf.ecs_cluster_name.value
        & $put "ecr/repository-urls" (($tf.ecr_repository_urls.value | ConvertTo-Json -Compress))
        & $put "ecr/repository-names" (($tf.ecr_repository_names.value | ConvertTo-Json -Compress))
        & $put "codedeploy/ecs/application-name" $tf.codedeploy_ecs_application_name.value
        & $put "codedeploy/ecs/deployment-groups" (($tf.codedeploy_ecs_deployment_group_names.value | ConvertTo-Json -Compress))
        & $put "codedeploy/lambda/application-name" $tf.codedeploy_lambda_application_name.value
        & $put "codedeploy/lambda/deployment-groups" (($tf.codedeploy_lambda_deployment_group_names.value | ConvertTo-Json -Compress))
        & $put "lambda/function-names" ((@{
            log = $tf.log_lambda_name.value
            aml = $tf.aml_lambda_name.value
            transaction_ingestion = $tf.transaction_ingestion_lambda_name.value
            verification = $tf.verification_lambda_name.value
        } | ConvertTo-Json -Compress))
        & $put "frontend/s3-bucket" $tf.frontend_bucket_name.value
        & $put "frontend/cloudfront-distribution-id" $tf.cloudfront_distribution_id.value
        & $put "frontend/app-url" $tf.app_url.value

        Write-Host "[OK] Published deployment metadata to SSM"
    }

    if ($SyncDeployerRoleArn) {
        Write-Host "[INFO] Local run: skipping GitHub environment variable sync."
        Write-Host "[INFO] Deployer role ARN: $($tf.deployer_role_arn.value)"
    }
} finally {
    Pop-Location
}

Write-Host "[DONE] InfrastructureUp local test complete"
Write-Host "[INFO] Output artifact: $outputJson"
Write-Host "[INFO] Snapshot artifact: $snapshotJson"
