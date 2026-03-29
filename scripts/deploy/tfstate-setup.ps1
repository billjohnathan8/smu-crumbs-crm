param(
  [switch]$Lab,
  [switch]$Prod,

  [string]$AwsRegion,
  [string]$StateBucketName,
  [string]$LockTableName,
  [switch]$SkipLockTable,

  # Optional: pick a configured CLI profile to resolve caller identity
  # and perform operations.
  [string]$Profile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg) {
  throw $msg
}

function Write-Info([string]$msg) {
  Write-Host "[INFO] $msg"
}

function Write-Ok([string]$msg) {
  Write-Host "[OK] $msg"
}

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
    Fail "AWS command failed: no arguments supplied"
  }

  $out = $null
  $code = 0
  $stderrText = ""
  $stdoutFile = [System.IO.Path]::GetTempFileName()
  $stderrFile = [System.IO.Path]::GetTempFileName()

  try {
    # Use Start-Process to avoid PowerShell converting native stderr output
    # into terminating NativeCommandError records under strict preferences.
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
      $trimmed = $stderrText.Trim()
      $errSuffix = ": " + $trimmed
    }
    Fail ("AWS command failed: aws " + ($full -join " ") +
      " (exit $code)" + $errSuffix)
  }

  if ($CaptureOutput) { return ,$out }
  return $code
}

function Test-Aws {
  param([string[]]$AwsArgs)
  $code = Invoke-Aws -AwsArgs $AwsArgs -AllowFailure
  return ($code -eq 0)
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Fail "aws CLI not found in PATH"
}

if ($Lab -and $Prod) {
  Fail "Choose exactly one: -Lab or -Prod"
}
if (-not $Lab -and -not $Prod) {
  Fail "You must specify either -Lab or -Prod"
}

# Resolve caller with current CLI config/profile
$callerArgs = @("sts", "get-caller-identity", "--output", "json")
$callerOut = Invoke-Aws -AwsArgs $callerArgs -CaptureOutput
$callerJson = $callerOut | ConvertFrom-Json
if (-not $callerJson.Account) {
  Fail "Failed to resolve AWS caller identity"
}

# Regions
if (-not $AwsRegion) {
  $AwsRegion = if ($Lab) { "us-east-1" } else { "ap-southeast-1" }
}
$env:AWS_DEFAULT_REGION = $AwsRegion

# Derived names
$envName = if ($Lab) { "lab" } else { "prod" }
if (-not $StateBucketName) {
  $StateBucketName = "scroogebank-crm-$envName-tfstate"
}
if (-not $LockTableName) {
  $LockTableName = "scroogebank-crm-$envName-tflock"
}

Write-Info "Caller account: $($callerJson.Account)"
Write-Info "Region: $AwsRegion"
Write-Info "State bucket: $StateBucketName"
Write-Info "Lock table: $LockTableName"

# Use current AWS CLI identity for both Lab and Prod
if ($Lab) {
  [void](Invoke-Aws -AwsArgs @(
    "sts", "get-caller-identity", "--output", "json"
  ))
  Write-Ok "Using current AWS CLI credentials for lab"
} else {
  # Prod: verify current creds work
  [void](Invoke-Aws -AwsArgs @(
    "sts", "get-caller-identity", "--output", "json"
  ))
  Write-Ok "Using current credentials for prod"
}

# S3 bucket existence
$bucketExists = Test-Aws @(
  "s3api", "head-bucket", "--bucket", $StateBucketName
)

if (-not $bucketExists) {
  if ($AwsRegion -eq "us-east-1") {
    [void](Invoke-Aws -AwsArgs @(
      "s3api", "create-bucket",
      "--bucket", $StateBucketName,
      "--region", $AwsRegion
    ))
  } else {
    [void](Invoke-Aws -AwsArgs @(
      "s3api", "create-bucket",
      "--bucket", $StateBucketName,
      "--region", $AwsRegion,
      "--create-bucket-configuration",
      "LocationConstraint=$AwsRegion"
    ))
  }
  Write-Ok "Created bucket: $StateBucketName"
} else {
  Write-Ok "Bucket already exists: $StateBucketName"
}

# Enable versioning
[void](Invoke-Aws -AwsArgs @(
  "s3api", "put-bucket-versioning",
  "--bucket", $StateBucketName,
  "--versioning-configuration", "Status=Enabled"
))

# Enable SSE (AES256)
[void](Invoke-Aws -AwsArgs @(
  "s3api", "put-bucket-encryption",
  "--bucket", $StateBucketName,
  "--server-side-encryption-configuration",
  "Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]"
))

# DynamoDB lock table
if (-not $SkipLockTable) {
  $tableExists = Test-Aws @(
    "dynamodb", "describe-table",
    "--table-name", $LockTableName,
    "--region", $AwsRegion
  )

  if (-not $tableExists) {
    [void](Invoke-Aws -AwsArgs @(
      "dynamodb", "create-table",
      "--table-name", $LockTableName,
      "--attribute-definitions",
      "AttributeName=LockID,AttributeType=S",
      "--key-schema",
      "AttributeName=LockID,KeyType=HASH",
      "--billing-mode", "PAY_PER_REQUEST",
      "--region", $AwsRegion
    ))
    [void](Invoke-Aws -AwsArgs @(
      "dynamodb", "wait", "table-exists",
      "--table-name", $LockTableName,
      "--region", $AwsRegion
    ))
    Write-Ok "Created lock table: $LockTableName"
  } else {
    Write-Ok "Lock table already exists: $LockTableName"
  }
} else {
  Write-Info "Skipping lock table creation as requested"
}

Write-Host "[DONE] tfstate backend setup complete"