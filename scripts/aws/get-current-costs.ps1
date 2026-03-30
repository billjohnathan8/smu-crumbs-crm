#
# AWS Cost Analysis Script
# Gets actual costs from AWS Cost Explorer and estimates live burn rate from running services
#

param(
    [int]$Days = 7,
    [switch]$ShowHourly,
    [switch]$CompareInfracost,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
AWS Cost Analysis Script

USAGE:
  .\get-current-costs.ps1 [OPTIONS]

OPTIONS:
  -Days <number>        Number of days to analyze (default: 7)
  -ShowHourly           Show hourly breakdown (experimental)
  -CompareInfracost     Compare with Infracost estimates
  -Help                 Show this help message

EXAMPLES:
  # Get costs for last 7 days
  .\get-current-costs.ps1

  # Get costs for last 30 days
  .\get-current-costs.ps1 -Days 30

  # Show hourly breakdown
  .\get-current-costs.ps1 -Days 1 -ShowHourly

  # Compare actual vs estimated costs
  .\get-current-costs.ps1 -CompareInfracost

REQUIREMENTS:
  - AWS CLI configured with credentials
  - Cost Explorer API enabled in AWS account
"@ -ForegroundColor Cyan
    exit 0
}

$ErrorActionPreference = "Continue"

function Get-AwsRegion {
    $region = (aws configure get region 2>$null)
    if ([string]::IsNullOrWhiteSpace($region)) {
        return "ap-southeast-1"
    }
    return $region.Trim()
}

function Get-FargateRates {
    param([string]$Region)

    # Fargate Linux/x86 on-demand hourly rates (fallback map).
    # These are used for live burn estimation only; billed truth remains Cost Explorer.
    $rates = @{
        "us-east-1"      = @{ Vcpu = 0.04048; MemoryGb = 0.004445 }
        "us-west-2"      = @{ Vcpu = 0.04048; MemoryGb = 0.004445 }
        "eu-west-1"      = @{ Vcpu = 0.04656; MemoryGb = 0.00511 }
        "ap-southeast-1" = @{ Vcpu = 0.05056; MemoryGb = 0.00553 }
        "ap-southeast-2" = @{ Vcpu = 0.05256; MemoryGb = 0.00575 }
    }

    if ($rates.ContainsKey($Region)) {
        return $rates[$Region]
    }

    # Safe default if region is not mapped.
    return @{ Vcpu = 0.05056; MemoryGb = 0.00553 }
}

function Get-TaskDefinitionCpuMemory {
    param($TaskDefinition)

    $cpuUnits = 0
    $memoryMb = 0

    if ($TaskDefinition.cpu) {
        $cpuUnits = [int]$TaskDefinition.cpu
    }
    if ($TaskDefinition.memory) {
        $memoryMb = [int]$TaskDefinition.memory
    }

    if ($cpuUnits -le 0) {
        foreach ($container in $TaskDefinition.containerDefinitions) {
            if ($container.cpu) {
                $cpuUnits += [int]$container.cpu
            }
        }
    }

    if ($memoryMb -le 0) {
        foreach ($container in $TaskDefinition.containerDefinitions) {
            if ($container.memory) {
                $memoryMb += [int]$container.memory
            } elseif ($container.memoryReservation) {
                $memoryMb += [int]$container.memoryReservation
            }
        }
    }

    [PSCustomObject]@{
        CpuVcpu  = if ($cpuUnits -gt 0) { [decimal]$cpuUnits / 1024 } else { [decimal]0 }
        MemoryGb = if ($memoryMb -gt 0) { [decimal]$memoryMb / 1024 } else { [decimal]0 }
    }
}

function Get-LiveBurnRate {
    param(
        [string]$Region
    )

    $fargateRates = Get-FargateRates -Region $Region
    $items = @()
    $totalHourly = [decimal]0

    try {
        $clustersObj = aws ecs list-clusters --region $Region --output json 2>$null | ConvertFrom-Json
    } catch {
        return [PSCustomObject]@{
            HourlyEstimate = [decimal]0
            MonthlyEstimate = [decimal]0
            Region = $Region
            Notes = @("Unable to list ECS clusters for live burn rate.")
            Items = @()
        }
    }

    $clusterArns = @($clustersObj.clusterArns)
    if ($clusterArns.Count -eq 0) {
        return [PSCustomObject]@{
            HourlyEstimate = [decimal]0
            MonthlyEstimate = [decimal]0
            Region = $Region
            Notes = @("No ECS clusters found. Live burn estimate currently includes ECS Fargate only.")
            Items = @()
        }
    }

    foreach ($clusterArn in $clusterArns) {
        $servicesObj = aws ecs list-services --cluster $clusterArn --region $Region --output json 2>$null | ConvertFrom-Json
        $serviceArns = @($servicesObj.serviceArns)
        if ($serviceArns.Count -eq 0) { continue }

        for ($i = 0; $i -lt $serviceArns.Count; $i += 10) {
            $chunk = $serviceArns[$i..([Math]::Min($i + 9, $serviceArns.Count - 1))]
            $servicesJson = aws ecs describe-services --cluster $clusterArn --services $chunk --region $Region --output json 2>$null
            if (-not $servicesJson) { continue }
            $servicesObjFull = $servicesJson | ConvertFrom-Json

            foreach ($svc in $servicesObjFull.services) {
                $runningCount = [int]$svc.runningCount
                if ($runningCount -le 0) { continue }

                $isFargate = $false
                if ($svc.launchType -eq "FARGATE") {
                    $isFargate = $true
                }
                if (-not $isFargate -and $svc.capacityProviderStrategy) {
                    foreach ($cp in $svc.capacityProviderStrategy) {
                        if ($cp.capacityProvider -match "FARGATE") {
                            $isFargate = $true
                            break
                        }
                    }
                }

                if (-not $isFargate) {
                    $items += [PSCustomObject]@{
                        Service = "$($svc.serviceName)"
                        Cluster = $clusterArn
                        RunningTasks = $runningCount
                        HourlyCost = [decimal]0
                        Basis = "Live service detected but launch type is not Fargate; not estimated"
                    }
                    continue
                }

                $taskDefArn = $svc.taskDefinition
                if (-not $taskDefArn) { continue }

                $tdObj = aws ecs describe-task-definition --task-definition $taskDefArn --region $Region --output json 2>$null | ConvertFrom-Json
                if (-not $tdObj.taskDefinition) { continue }

                $sizing = Get-TaskDefinitionCpuMemory -TaskDefinition $tdObj.taskDefinition
                $hourlyPerTask = ($sizing.CpuVcpu * [decimal]$fargateRates.Vcpu) + ($sizing.MemoryGb * [decimal]$fargateRates.MemoryGb)
                $svcHourly = [decimal]$runningCount * $hourlyPerTask
                $totalHourly += $svcHourly

                $items += [PSCustomObject]@{
                    Service = "$($svc.serviceName)"
                    Cluster = $clusterArn
                    RunningTasks = $runningCount
                    CpuPerTaskVcpu = $sizing.CpuVcpu
                    MemoryPerTaskGb = $sizing.MemoryGb
                    HourlyCost = $svcHourly
                    Basis = "ECS Fargate running tasks"
                }
            }
        }
    }

    $notes = @(
        "Live burn estimate currently includes ECS Fargate running tasks only.",
        "Cost Explorer remains billing truth; live estimate is point-in-time and excludes credits."
    )

    [PSCustomObject]@{
        HourlyEstimate = $totalHourly
        MonthlyEstimate = ($totalHourly * 730)
        Region = $Region
        Notes = $notes
        Items = $items
    }
}

# Output directory structure
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$awsRoot = "aws"
$costRoot = Join-Path $awsRoot "costs"
$outputDir = Join-Path $costRoot "cost-analysis-$timestamp"

New-Item -ItemType Directory -Force -Path $awsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $costRoot | Out-Null

$legacyCostRoots = @("aws-inventory\cost", "aws-inventory\costs")
foreach ($legacyRoot in $legacyCostRoots) {
    if (Test-Path $legacyRoot) {
        Get-ChildItem -Path $legacyRoot -Directory -Filter "cost-analysis-*" -ErrorAction SilentlyContinue | ForEach-Object {
            $targetPath = Join-Path $costRoot $_.Name
            if (-not (Test-Path $targetPath)) {
                Write-Host "  Migrating $($_.Name) from $legacyRoot to $costRoot" -ForegroundColor Cyan
                Move-Item -Path $_.FullName -Destination $targetPath -Force
            }
        }
    }
}

$keepCount = 3
$pruneBeforeCreate = $keepCount - 1
$allRuns = Get-ChildItem -Path $costRoot -Directory -Filter "cost-analysis-*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending

if ($allRuns.Count -gt $pruneBeforeCreate) {
    Write-Host "Pruning old cost analysis runs (keeping latest $keepCount)..." -ForegroundColor Yellow
    $allRuns | Select-Object -Skip $pruneBeforeCreate | ForEach-Object {
        Write-Host "  Removing old run: $($_.Name)" -ForegroundColor Gray
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AWS Cost Analysis" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Output: $outputDir" -ForegroundColor Cyan
Write-Host ""

$transcriptPath = Join-Path $outputDir "cost-analysis.log"
Start-Transcript -Path $transcriptPath -Force | Out-Null

try {
    $identity = aws sts get-caller-identity 2>&1 | ConvertFrom-Json
    Write-Host "Account ID: $($identity.Account)" -ForegroundColor Green
    Write-Host "User/Role: $($identity.Arn)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: AWS CLI not configured properly" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}

$region = Get-AwsRegion
$endDate = Get-Date
$startDate = $endDate.AddDays(-$Days)
$startDateStr = $startDate.ToString("yyyy-MM-dd")
$endDateStr = $endDate.ToString("yyyy-MM-dd")

Write-Host "Region: $region" -ForegroundColor Yellow
Write-Host "Analyzing costs from $startDateStr to $endDateStr..." -ForegroundColor Yellow
Write-Host ""

Write-Host "=== Cost by Service (Net Unblended) ===" -ForegroundColor Cyan
$costByService = aws ce get-cost-and-usage `
    --time-period "Start=$startDateStr,End=$endDateStr" `
    --granularity DAILY `
    --metrics UnblendedCost `
    --group-by Type=DIMENSION,Key=SERVICE | ConvertFrom-Json

$totalCost = [decimal]0
$serviceCosts = @{}

foreach ($result in $costByService.ResultsByTime) {
    foreach ($group in $result.Groups) {
        $service = $group.Keys[0]
        $cost = [decimal]$group.Metrics.UnblendedCost.Amount
        if ($serviceCosts.ContainsKey($service)) {
            $serviceCosts[$service] += $cost
        } else {
            $serviceCosts[$service] = $cost
        }
        $totalCost += $cost
    }
}

$costByService | ConvertTo-Json -Depth 10 | Out-File (Join-Path $outputDir "cost-by-service.json")

$displayBase = if ([Math]::Abs([double]$totalCost) -ge 0.01) { [Math]::Abs([double]$totalCost) } else { 0.0 }
$serviceCosts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    $percentageText = if ($displayBase -gt 0) { ("{0:F1}%" -f (([double]$_.Value / $displayBase) * 100)) } else { "n/a" }
    Write-Host ("  {0,-40} `${1,10:F4}  ({2})" -f $_.Key, $_.Value, $percentageText)
}

Write-Host ""
if ([Math]::Abs([double]$totalCost) -lt 0.01) {
    Write-Host "NOTICE: Net cost rounds to about `$0.00" -ForegroundColor Yellow
    Write-Host "This usually means usage is offset by credits or discounts." -ForegroundColor Gray
    Write-Host ""
}

Write-Host ("Net Cost ({0} days): " -f $Days) -NoNewline -ForegroundColor Yellow
Write-Host ("`${0:F2}" -f $totalCost) -ForegroundColor Green

if ($totalCost -gt 0) {
    $hourlyRate = $totalCost / ($Days * 24)
    $monthlyProjected = $hourlyRate * 730
} else {
    $hourlyRate = 0
    $monthlyProjected = 0
}

Write-Host "Net Hourly Rate: " -ForegroundColor Yellow -NoNewline
Write-Host ("`${0:F4}/hour" -f $hourlyRate) -ForegroundColor Green
Write-Host "Net Projected Monthly Cost: " -ForegroundColor Yellow -NoNewline
Write-Host ("`${0:F2}" -f $monthlyProjected) -ForegroundColor Green
Write-Host ""

# Daily net breakdown
$dailyCosts = aws ce get-cost-and-usage `
    --time-period "Start=$startDateStr,End=$endDateStr" `
    --granularity DAILY `
    --metrics UnblendedCost | ConvertFrom-Json
$dailyCosts | ConvertTo-Json -Depth 10 | Out-File (Join-Path $outputDir "daily-costs.json")

if ($Days -le 31) {
    Write-Host "=== Daily Breakdown (Net Unblended) ===" -ForegroundColor Cyan
    foreach ($day in $dailyCosts.ResultsByTime) {
        $date = $day.TimePeriod.Start
        $cost = [decimal]$day.Total.UnblendedCost.Amount
        $dailyHourly = $cost / 24
        Write-Host ("  {0}  `${1,10:F4}  (`${2:F6}/hour)" -f $date, $cost, $dailyHourly)
    }
    Write-Host ""
}

# Gross usage vs credits
$recordTypePayload = aws ce get-cost-and-usage `
    --time-period "Start=$startDateStr,End=$endDateStr" `
    --granularity DAILY `
    --metrics UnblendedCost `
    --group-by Type=DIMENSION,Key=RECORD_TYPE | ConvertFrom-Json

$grossUsage = [decimal]0
$credits = [decimal]0
foreach ($result in $recordTypePayload.ResultsByTime) {
    foreach ($group in $result.Groups) {
        $recordType = $group.Keys[0]
        $amount = [decimal]$group.Metrics.UnblendedCost.Amount
        if ($recordType -eq "Usage") {
            $grossUsage += $amount
        }
        if ($recordType -eq "Credit") {
            $credits += $amount
        }
    }
}
$grossHourlyRate = if ($Days -gt 0) { $grossUsage / ($Days * 24) } else { 0 }
$grossMonthlyProjected = $grossHourlyRate * 730

# Live burn estimate
Write-Host "=== Live Burn Rate Estimate ===" -ForegroundColor Cyan
$liveBurn = Get-LiveBurnRate -Region $region
Write-Host ("Estimated Live Burn: `${0:F4}/hour (`${1:F2}/month)" -f $liveBurn.HourlyEstimate, $liveBurn.MonthlyEstimate) -ForegroundColor Green
if ($liveBurn.Items.Count -gt 0) {
    foreach ($item in ($liveBurn.Items | Sort-Object HourlyCost -Descending)) {
        Write-Host ("  - {0}: {1} running task(s), `${2:F4}/hour" -f $item.Service, $item.RunningTasks, $item.HourlyCost) -ForegroundColor Gray
    }
} else {
    Write-Host "  No currently running ECS tasks found for live estimate." -ForegroundColor Gray
}
foreach ($note in $liveBurn.Notes) {
    Write-Host ("  Note: " + $note) -ForegroundColor DarkGray
}
Write-Host ""

$liveBurn | ConvertTo-Json -Depth 8 | Out-File (Join-Path $outputDir "live-burn-rate.json")
$recordTypePayload | ConvertTo-Json -Depth 8 | Out-File (Join-Path $outputDir "record-type-costs.json")

if ($ShowHourly -and $Days -le 3) {
    Write-Host "=== Hourly Breakdown (Estimated) ===" -ForegroundColor Cyan
    Write-Host "Cost Explorer provides DAILY granularity. Hourly values are derived estimates." -ForegroundColor Yellow
    $lastDayCost = [decimal]$dailyCosts.ResultsByTime[-1].Total.UnblendedCost.Amount
    $avgHourly = $lastDayCost / 24
    Write-Host ("Yesterday's estimated net hourly cost: `${0:F6}/hour" -f $avgHourly) -ForegroundColor Cyan
    Write-Host ""
}

if ($CompareInfracost) {
    Write-Host "=== Infracost Comparison ===" -ForegroundColor Cyan

    $infracostReport = "platform\terraform\.infracost\infracost-report.txt"
    if (Test-Path $infracostReport) {
        $infracostContent = Get-Content $infracostReport -Raw

        if ($infracostContent -match 'OVERALL TOTAL.*\$([0-9,]+\.[0-9]{2})') {
            $infracostMonthly = [decimal]$Matches[1].Replace(',', '')
            $infracostHourly = $infracostMonthly / 730

            Write-Host ("Infracost Estimate (Monthly): `${0:F2}" -f $infracostMonthly) -ForegroundColor Cyan
            Write-Host ("Infracost Estimate (Hourly):  `${0:F4}/hour" -f $infracostHourly) -ForegroundColor Cyan
            Write-Host ""

            Write-Host ("Actual Net (Projected Monthly): `${0:F2}" -f $monthlyProjected) -ForegroundColor Green
            Write-Host ("Actual Gross (Projected Monthly): `${0:F2}" -f $grossMonthlyProjected) -ForegroundColor Green
            Write-Host ("Live Estimate (Projected Monthly): `${0:F2}" -f $liveBurn.MonthlyEstimate) -ForegroundColor Green
            Write-Host ""

            if ($infracostMonthly -ne 0) {
                $difference = $grossMonthlyProjected - $infracostMonthly
                $percentDiff = ($difference / $infracostMonthly) * 100

                if ($difference -gt 0) {
                    Write-Host ("Difference vs gross: +`${0:F2} ({1:F1}% over estimate)" -f $difference, $percentDiff) -ForegroundColor Red
                } elseif ($difference -lt 0) {
                    Write-Host ("Difference vs gross: `${0:F2} ({1:F1}% under estimate)" -f $difference, $percentDiff) -ForegroundColor Green
                } else {
                    Write-Host "Gross costs match estimate!" -ForegroundColor Green
                }
            }
            Write-Host ""
        } else {
            Write-Host "Could not parse Infracost report" -ForegroundColor Red
        }
    } else {
        Write-Host "Infracost report not found at: $infracostReport" -ForegroundColor Red
        Write-Host "Run Infracost first: cd platform/terraform && infracost breakdown --path ." -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "=== Cost Optimization Suggestions ===" -ForegroundColor Cyan

$expensiveServices = @()
if ($grossUsage -gt 0) {
    $expensiveServices = $serviceCosts.GetEnumerator() |
        Where-Object { $_.Value -gt ($grossUsage * 0.15) } |
        Sort-Object Value -Descending
}

if ($expensiveServices -and $expensiveServices.Count -gt 0) {
    Write-Host "Services consuming >15% of gross usage cost:" -ForegroundColor Yellow
    foreach ($svc in $expensiveServices) {
        $percentage = ($svc.Value / $grossUsage) * 100
        Write-Host ("  - {0}: `${1:F2} ({2:F1}%)" -f $svc.Key, $svc.Value, $percentage)

        switch -Regex ($svc.Key) {
            "EC2" { Write-Host "    Consider: Reserved Instances, Spot Instances, or right-sizing" -ForegroundColor Gray }
            "RDS" { Write-Host "    Consider: Reserved Instances, Aurora Serverless, or smaller instance types" -ForegroundColor Gray }
            "NAT Gateway" { Write-Host "    Consider: VPC endpoints, combining NAT gateways, or removing if unused" -ForegroundColor Gray }
            "Data Transfer" { Write-Host "    Consider: Using CloudFront, VPC endpoints, or optimizing data transfer paths" -ForegroundColor Gray }
            "ECS|Fargate" { Write-Host "    Consider: Right-sizing tasks, using Spot, or Savings Plans" -ForegroundColor Gray }
        }
    }
} else {
    Write-Host "No significant gross usage concentrations detected" -ForegroundColor Green
}

Write-Host ""

# Prepare markdown sections safely
$dailyRows = @()
foreach ($day in $dailyCosts.ResultsByTime) {
    $date = $day.TimePeriod.Start
    $cost = [decimal]$day.Total.UnblendedCost.Amount
    $dailyRows += "| $date | `$$($cost.ToString('F4'))` | `$$(($cost/24).ToString('F6'))/hour` |"
}
if ($dailyRows.Count -eq 0) {
    $dailyRows += "| (no data) | `$0.0000 | `$0.000000/hour |"
}

$serviceRows = @()
foreach ($entry in ($serviceCosts.GetEnumerator() | Sort-Object Value -Descending)) {
    $pct = if ($grossUsage -gt 0) { (($entry.Value / $grossUsage) * 100).ToString('F1') } else { "0.0" }
    $serviceRows += "| $($entry.Key) | `$$($entry.Value.ToString('F4'))` | $pct% |"
}
if ($serviceRows.Count -eq 0) {
    $serviceRows += "| (no services) | `$0.0000 | 0.0% |"
}

$liveRows = @()
foreach ($item in ($liveBurn.Items | Sort-Object HourlyCost -Descending)) {
    $liveRows += "| $($item.Service) | $($item.RunningTasks) | `$$($item.HourlyCost.ToString('F4'))/hour` | $($item.Basis) |"
}
if ($liveRows.Count -eq 0) {
    $liveRows += "| (none) | 0 | `$0.0000/hour | No running ECS tasks detected |"
}

$summaryPath = Join-Path $outputDir "SUMMARY.md"
$summary = @"
# AWS Cost Analysis Report

**Generated:** $(Get-Date)
**Account ID:** $($identity.Account)
**User/Role:** $($identity.Arn)
**Region:** $region
**Analysis Period:** $startDateStr to $endDateStr ($Days days)

---

## Cost Summary

| Metric | Value |
|--------|-------|
| Live Burn Rate (Now, Estimate) | `$$($liveBurn.HourlyEstimate.ToString('F4'))/hour` |
| Live Burn Projected Monthly (Estimate) | `$$($liveBurn.MonthlyEstimate.ToString('F2'))` |
| Gross Usage Cost ($Days days) | `$$($grossUsage.ToString('F4'))` |
| Credits/Discounts ($Days days) | `$$($credits.ToString('F4'))` |
| Net Cost ($Days days) | `$$($totalCost.ToString('F4'))` |
| Net Hourly Average | `$$($hourlyRate.ToString('F6'))/hour` |
| Net Projected Monthly | `$$($monthlyProjected.ToString('F2'))` |

---

## Live Burn Details (Point-in-Time)

| Service | Running Tasks | Estimated Burn | Basis |
|---------|---------------|----------------|-------|
$($liveRows -join "`n")

### Live Burn Notes
$(($liveBurn.Notes | ForEach-Object { "- $_" }) -join "`n")

---

## Cost by Service (Net Unblended)

| Service | Cost | % of Gross Usage |
|---------|------|------------------|
$($serviceRows -join "`n")

---

## Daily Breakdown (Net Unblended)

| Date | Cost | Hourly Avg |
|------|------|-----------|
$($dailyRows -join "`n")

---

## Notes

- Net cost can be near `$0 when credits offset usage.
- Live burn rate is an estimate of current running workload, not a billed amount.
- Billed source of truth is AWS Cost Explorer.

## Files in This Report

- SUMMARY.md - This file
- cost-analysis.log - Detailed console output
- cost-by-service.json - Raw cost data by service
- daily-costs.json - Raw daily cost data
- record-type-costs.json - Gross usage and credits by record type
- live-burn-rate.json - Live burn-rate estimate inputs and results

"@

$summary | Out-File -FilePath $summaryPath -Encoding UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Analysis Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Reports saved to: $outputDir" -ForegroundColor Green
Write-Host ""
Write-Host "Quick view:" -ForegroundColor Yellow
Write-Host "  Get-Content $summaryPath | More" -ForegroundColor White
Write-Host ""
Write-Host "All cost analyses (latest 3 kept):" -ForegroundColor Yellow
Write-Host "  Get-ChildItem $costRoot" -ForegroundColor White
Write-Host ""
Write-Host "For more details, visit AWS Cost Explorer:" -ForegroundColor Yellow
Write-Host "https://console.aws.amazon.com/cost-management/home#/dashboard" -ForegroundColor Blue
Write-Host ""

Stop-Transcript | Out-Null
