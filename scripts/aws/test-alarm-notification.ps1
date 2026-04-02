param(
    [Parameter(Mandatory = $true)]
    [string]$AlarmName,

    [string]$AwsRegion = "ap-southeast-1",
    [string]$TerraformDir = "",
    [int]$WaitSeconds = 30,
    [switch]$NoReset,
    [switch]$SkipSubscriptionCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    exit 1
}

function Ensure-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "Required command '$Name' not found in PATH."
    }
}

function Invoke-AwsJson {
    param([string[]]$Args)
    $raw = & aws @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail "AWS CLI command failed: aws $($Args -join ' ')`n$raw"
    }
    if ([string]::IsNullOrWhiteSpace(($raw | Out-String))) {
        return $null
    }
    return ($raw | Out-String | ConvertFrom-Json)
}

Ensure-Command "aws"
Ensure-Command "terraform"

if ($WaitSeconds -lt 0) {
    Fail "WaitSeconds must be >= 0."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($TerraformDir)) {
    $TerraformDir = Join-Path $repoRoot "platform\terraform"
} elseif (-not [System.IO.Path]::IsPathRooted($TerraformDir)) {
    # Resolve relative paths from current shell location.
    $TerraformDir = (Resolve-Path $TerraformDir).Path
}

if (-not (Test-Path -LiteralPath $TerraformDir)) {
    Fail "TerraformDir not found: $TerraformDir"
}

$env:AWS_REGION = $AwsRegion
$env:AWS_DEFAULT_REGION = $AwsRegion

Write-Step "Validating target alarm exists"
$alarmInfo = Invoke-AwsJson -Args @(
    "cloudwatch", "describe-alarms",
    "--alarm-names", $AlarmName,
    "--region", $AwsRegion
)
if ($null -eq $alarmInfo -or $alarmInfo.MetricAlarms.Count -eq 0) {
    Fail "Alarm '$AlarmName' not found in region '$AwsRegion'."
}
Write-Ok "Alarm found: $AlarmName"

Write-Step "Resolving alarm notification SNS topic ARN from Terraform output"
$topicArn = terraform -chdir="$TerraformDir" output -raw alarm_notification_topic_arn 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($topicArn)) {
    Fail "Unable to resolve 'alarm_notification_topic_arn' from Terraform outputs in '$TerraformDir'."
}
$topicArn = $topicArn.Trim()
Write-Host "  Topic ARN: $topicArn"

if (-not $SkipSubscriptionCheck) {
    Write-Step "Checking SNS email subscriptions and confirmation state"
    $subs = Invoke-AwsJson -Args @(
        "sns", "list-subscriptions-by-topic",
        "--topic-arn", $topicArn,
        "--region", $AwsRegion
    )

    if ($null -eq $subs -or $subs.Subscriptions.Count -eq 0) {
        Write-Warn "No subscriptions found on topic. Alarm notification emails will not be delivered."
    } else {
        $emailSubs = @($subs.Subscriptions | Where-Object { $_.Protocol -eq "email" })
        if ($emailSubs.Count -eq 0) {
            Write-Warn "No email subscriptions found on topic."
        } else {
            Write-Host "  Email subscriptions:"
            foreach ($sub in $emailSubs) {
                $status = if ($sub.SubscriptionArn -eq "PendingConfirmation") { "PENDING" } else { "CONFIRMED" }
                Write-Host "    - $($sub.Endpoint) [$status]"
            }
            $pending = @($emailSubs | Where-Object { $_.SubscriptionArn -eq "PendingConfirmation" })
            if ($pending.Count -gt 0) {
                Write-Warn "One or more subscriptions are pending confirmation. Those inboxes will not receive notifications yet."
            }
        }
    }
}

$now = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
$alarmReason = "manual notification test: set ALARM ($now)"
$okReason = "manual notification test: reset OK ($now)"

Write-Step "Setting alarm state to ALARM"
& aws cloudwatch set-alarm-state `
    --alarm-name $AlarmName `
    --state-value ALARM `
    --state-reason $alarmReason `
    --region $AwsRegion
if ($LASTEXITCODE -ne 0) {
    Fail "Failed to set alarm state to ALARM."
}
Write-Ok "Alarm forced to ALARM"

if ($WaitSeconds -gt 0) {
    Write-Step "Waiting $WaitSeconds second(s) for notifications"
    Start-Sleep -Seconds $WaitSeconds
}

Write-Step "Fetching latest alarm history"
$history = Invoke-AwsJson -Args @(
    "cloudwatch", "describe-alarm-history",
    "--alarm-name", $AlarmName,
    "--max-items", "5",
    "--region", $AwsRegion
)
if ($history -ne $null -and $history.AlarmHistoryItems.Count -gt 0) {
    foreach ($item in $history.AlarmHistoryItems) {
        $ts = $item.Timestamp
        $summary = $item.HistorySummary
        Write-Host "  [$ts] $summary"
    }
}

if ($NoReset) {
    Write-Warn "NoReset specified. Alarm left in ALARM state."
    Write-Host "[SUCCESS] Alarm notification test completed (without reset)." -ForegroundColor Green
    exit 0
}

Write-Step "Resetting alarm state to OK"
& aws cloudwatch set-alarm-state `
    --alarm-name $AlarmName `
    --state-value OK `
    --state-reason $okReason `
    --region $AwsRegion
if ($LASTEXITCODE -ne 0) {
    Fail "Failed to reset alarm state to OK. Reset it manually."
}
Write-Ok "Alarm reset to OK"

Write-Host ""
Write-Host "[SUCCESS] Alarm notification test completed." -ForegroundColor Green
