param(
  [string]$Environment = "prod",
  [string]$ProjectName = "",
  [string]$AwsRegion = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectName)) {
  $ProjectName = if ([string]::IsNullOrWhiteSpace($env:TF_PROJECT_NAME)) { "scroogebank-crm" } else { $env:TF_PROJECT_NAME }
}

if ([string]::IsNullOrWhiteSpace($AwsRegion)) {
  $AwsRegion = if ([string]::IsNullOrWhiteSpace($env:AWS_REGION)) { "ap-southeast-1" } else { $env:AWS_REGION }
}

$namePrefix = "$ProjectName-$Environment"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "aws CLI is required but was not found in PATH."
}

function Invoke-AwsCli {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$Quiet
  )

  $nativeErrorPreference = $null
  $hasNativeErrorPreference = $null -ne (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)
  $previousErrorActionPreference = $ErrorActionPreference

  if ($hasNativeErrorPreference) {
    $nativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    $script:PSNativeCommandUseErrorActionPreference = $false
  }

  try {
    $ErrorActionPreference = "Continue"

    if ($Quiet) {
      $output = & aws @Arguments 2>$null
    }
    else {
      $output = & aws @Arguments
    }

    return [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output   = ($output | Out-String).Trim()
    }
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference

    if ($hasNativeErrorPreference) {
      $script:PSNativeCommandUseErrorActionPreference = $nativeErrorPreference
    }
  }
}

function Test-SecretExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SecretName
  )

  $result = Invoke-AwsCli -Arguments @(
    "secretsmanager",
    "describe-secret",
    "--secret-id", $SecretName,
    "--region", $AwsRegion
  ) -Quiet

  return ($result.ExitCode -eq 0)
}

function Get-SecretDeletedDate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SecretName
  )

  $result = Invoke-AwsCli -Arguments @(
    "secretsmanager",
    "describe-secret",
    "--secret-id", $SecretName,
    "--region", $AwsRegion,
    "--query", "DeletedDate",
    "--output", "text"
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    return $null
  }

  $deletedDate = $result.Output
  if ([string]::IsNullOrWhiteSpace($deletedDate) -or $deletedDate -eq "None") {
    return $null
  }

  return $deletedDate
}

function Wait-SecretReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SecretName
  )

  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    if (-not (Test-SecretExists -SecretName $SecretName)) {
      return
    }

    $deletedDate = Get-SecretDeletedDate -SecretName $SecretName
    if ([string]::IsNullOrWhiteSpace($deletedDate)) {
      return
    }

    Start-Sleep -Seconds 5
  }

  throw "Timed out waiting for secret to leave pending-deletion state: $SecretName"
}

function Wait-SecretAbsent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SecretName
  )

  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    if (-not (Test-SecretExists -SecretName $SecretName)) {
      return
    }

    Start-Sleep -Seconds 5
  }

  throw "Timed out waiting for secret to be deleted: $SecretName"
}

function Remove-SecretForcefully {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SecretName
  )

  if (-not (Test-SecretExists -SecretName $SecretName)) {
    Write-Host "Secret already absent: $SecretName"
    return
  }

  $deletedDate = Get-SecretDeletedDate -SecretName $SecretName
  if (-not [string]::IsNullOrWhiteSpace($deletedDate)) {
    Write-Host "Restoring secret before force delete: $SecretName"
    $result = Invoke-AwsCli -Arguments @(
      "secretsmanager",
      "restore-secret",
      "--secret-id", $SecretName,
      "--region", $AwsRegion
    ) -Quiet

    if ($result.ExitCode -ne 0) {
      throw "Failed to restore secret: $SecretName"
    }

    Wait-SecretReady -SecretName $SecretName
  }

  Write-Host "Force deleting secret without recovery window: $SecretName"
  $result = Invoke-AwsCli -Arguments @(
    "secretsmanager",
    "delete-secret",
    "--secret-id", $SecretName,
    "--region", $AwsRegion,
    "--force-delete-without-recovery"
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    throw "Failed to force delete secret: $SecretName"
  }

  Wait-SecretAbsent -SecretName $SecretName
}

function Test-LogGroupExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LogGroupName
  )

  $result = Invoke-AwsCli -Arguments @(
    "logs",
    "describe-log-groups",
    "--region", $AwsRegion,
    "--log-group-name-prefix", $LogGroupName,
    "--query", "length(logGroups[?logGroupName == '$LogGroupName'])",
    "--output", "text"
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    throw "Failed to query log groups for: $LogGroupName"
  }

  $count = $result.Output
  return ($count -ne "0" -and $count -ne "None" -and -not [string]::IsNullOrWhiteSpace($count))
}

function Wait-LogGroupAbsent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LogGroupName
  )

  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    if (-not (Test-LogGroupExists -LogGroupName $LogGroupName)) {
      return
    }

    Start-Sleep -Seconds 5
  }

  throw "Timed out waiting for log group to be deleted: $LogGroupName"
}

function Remove-LogGroupIfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LogGroupName
  )

  if (-not (Test-LogGroupExists -LogGroupName $LogGroupName)) {
    Write-Host "Log group already absent: $LogGroupName"
    return
  }

  Write-Host "Deleting log group: $LogGroupName"
  $result = Invoke-AwsCli -Arguments @(
    "logs",
    "delete-log-group",
    "--log-group-name", $LogGroupName,
    "--region", $AwsRegion
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    throw "Failed to delete log group: $LogGroupName"
  }

  Wait-LogGroupAbsent -LogGroupName $LogGroupName
}

Remove-SecretForcefully -SecretName "/$ProjectName/$Environment/jwt/hmac_secret"
Remove-SecretForcefully -SecretName "/$ProjectName/$Environment/user/root_admin_password"
Remove-SecretForcefully -SecretName "/$ProjectName/$Environment/db/username"
Remove-SecretForcefully -SecretName "/$ProjectName/$Environment/db/password"
Remove-LogGroupIfPresent -LogGroupName "/aws/vpc/$namePrefix-flow-logs"

Write-Host "Stale secrets and VPC flow log group cleanup complete. Rerun the Terraform plan workflow now."