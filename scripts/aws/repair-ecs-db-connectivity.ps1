param(
  [string]$ProjectName = "scroogebank-crm",
  [string]$Environment = "prod",
  [string]$AwsRegion = "ap-southeast-1",
  [string]$ClusterName = "",
  [string]$EcsSecurityGroupId = "",
  [string]$DbSecurityGroupId = "",
  [int]$DbPort = 5432,
  [string[]]$Services = @(),
  [switch]$WaitForStability
)

$ErrorActionPreference = "Stop"
$env:AWS_PAGER = ""

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

function Resolve-SecurityGroupId {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GroupName
  )

  $result = Invoke-AwsCli -Arguments @(
    "ec2",
    "describe-security-groups",
    "--region", $AwsRegion,
    "--filters", "Name=group-name,Values=$GroupName",
    "--query", "SecurityGroups[0].GroupId",
    "--output", "text"
  ) -Quiet

  if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Output) -or $result.Output -eq "None") {
    throw "Failed to resolve security group ID for group name: $GroupName"
  }

  return $result.Output
}

function Test-EgressRuleExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceSecurityGroupId,
    [Parameter(Mandatory = $true)]
    [string]$DestinationSecurityGroupId,
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $query = "length(SecurityGroupRules[?IsEgress == ``true`` && IpProtocol == 'tcp' && FromPort == ``$Port`` && ToPort == ``$Port`` && ReferencedGroupInfo.GroupId == '$DestinationSecurityGroupId'])"
  $result = Invoke-AwsCli -Arguments @(
    "ec2",
    "describe-security-group-rules",
    "--region", $AwsRegion,
    "--filters", "Name=group-id,Values=$SourceSecurityGroupId",
    "--query", $query,
    "--output", "text"
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    throw "Failed to inspect egress rules for security group: $SourceSecurityGroupId"
  }

  return $result.Output -ne "0"
}

function Add-EgressRuleIfMissing {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceSecurityGroupId,
    [Parameter(Mandatory = $true)]
    [string]$DestinationSecurityGroupId,
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  if (Test-EgressRuleExists -SourceSecurityGroupId $SourceSecurityGroupId -DestinationSecurityGroupId $DestinationSecurityGroupId -Port $Port) {
    Write-Host "Egress rule already present: $SourceSecurityGroupId -> $DestinationSecurityGroupId on port $Port" -ForegroundColor Green
    return
  }

  $permission = ConvertTo-Json -InputObject @(
    @{
      IpProtocol       = "tcp"
      FromPort         = $Port
      ToPort           = $Port
      UserIdGroupPairs = @(
        @{
          GroupId = $DestinationSecurityGroupId
        }
      )
    }
  ) -Compress -Depth 5

  $tempFile = [System.IO.Path]::GetTempFileName()

  try {
    [System.IO.File]::WriteAllText($tempFile, $permission, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Adding missing ECS-to-DB egress rule on port $Port..." -ForegroundColor Yellow
    $result = Invoke-AwsCli -Arguments @(
      "ec2",
      "authorize-security-group-egress",
      "--region", $AwsRegion,
      "--group-id", $SourceSecurityGroupId,
      "--ip-permissions", "file://$tempFile"
    )
  }
  finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }

  if ($result.ExitCode -ne 0) {
    throw "Failed to add ECS-to-DB egress rule."
  }

  Write-Host "Added egress rule: $SourceSecurityGroupId -> $DestinationSecurityGroupId on port $Port" -ForegroundColor Green
}

function Restart-EcsService {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceName
  )

  Write-Host "Forcing new deployment for $ServiceName..." -ForegroundColor Yellow
  $result = Invoke-AwsCli -Arguments @(
    "ecs",
    "update-service",
    "--region", $AwsRegion,
    "--cluster", $ClusterName,
    "--service", $ServiceName,
    "--force-new-deployment"
  ) -Quiet

  if ($result.ExitCode -ne 0) {
    throw "Failed to force new deployment for service: $ServiceName"
  }

  Write-Host "Triggered new deployment for $ServiceName" -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($ClusterName)) {
  $ClusterName = "$ProjectName-$Environment-ecs"
}

if ($Services.Count -eq 0) {
  $Services = @(
    "$ProjectName-$Environment-user",
    "$ProjectName-$Environment-client",
    "$ProjectName-$Environment-transaction"
  )
}

if ([string]::IsNullOrWhiteSpace($EcsSecurityGroupId)) {
  $EcsSecurityGroupId = Resolve-SecurityGroupId -GroupName "$ProjectName-$Environment-ecs-sg"
}

if ([string]::IsNullOrWhiteSpace($DbSecurityGroupId)) {
  $DbSecurityGroupId = Resolve-SecurityGroupId -GroupName "$ProjectName-$Environment-db-sg"
}

Write-Host "Cluster: $ClusterName" -ForegroundColor Cyan
Write-Host "Region: $AwsRegion" -ForegroundColor Cyan
Write-Host "ECS Security Group: $EcsSecurityGroupId" -ForegroundColor Cyan
Write-Host "DB Security Group: $DbSecurityGroupId" -ForegroundColor Cyan
Write-Host "Services: $($Services -join ', ')" -ForegroundColor Cyan

Add-EgressRuleIfMissing -SourceSecurityGroupId $EcsSecurityGroupId -DestinationSecurityGroupId $DbSecurityGroupId -Port $DbPort

foreach ($service in $Services) {
  Restart-EcsService -ServiceName $service
}

if ($WaitForStability) {
  Write-Host "Waiting for ECS services to reach a stable state..." -ForegroundColor Yellow
  $waitArgs = @(
    "ecs",
    "wait",
    "services-stable",
    "--region", $AwsRegion,
    "--cluster", $ClusterName,
    "--services"
  ) + $Services

  $result = Invoke-AwsCli -Arguments $waitArgs -Quiet

  if ($result.ExitCode -ne 0) {
    throw "ECS services did not reach a stable state."
  }

  Write-Host "ECS services are stable." -ForegroundColor Green
}

Write-Host "Repair script completed. Check ECS service events and target health to confirm recovery." -ForegroundColor Green