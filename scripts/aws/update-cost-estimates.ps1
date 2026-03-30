#
# Update Infracost Estimates Script
# Runs Infracost against current Terraform configuration and generates reports
#

param(
    [string]$Environment = "lab",
    [switch]$SyncUsage,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Update Infracost Estimates Script

USAGE:
  .\update-cost-estimates.ps1 [OPTIONS]

OPTIONS:
  -Environment <env>    Terraform environment (lab, dev, prod) [default: lab]
  -SyncUsage            Sync usage file with actual AWS usage data
  -Help                 Show this help message

EXAMPLES:
  # Update cost estimates for lab environment
  .\update-cost-estimates.ps1

  # Update for production environment
  .\update-cost-estimates.ps1 -Environment prod

  # Sync usage file with actual AWS data
  .\update-cost-estimates.ps1 -SyncUsage

REQUIREMENTS:
  - Infracost CLI installed (https://www.infracost.io/docs/)
  - INFRACOST_API_KEY environment variable set
  - Terraform initialized in platform/terraform
"@ -ForegroundColor Cyan
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Infracost Cost Estimate Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Infracost is installed
try {
    $infracostVersion = infracost --version 2>&1
    Write-Host "Infracost version: $infracostVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Infracost CLI not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Infracost:" -ForegroundColor Yellow
    Write-Host "  # Windows (PowerShell):" -ForegroundColor Gray
    Write-Host "  choco install infracost" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Or download from:" -ForegroundColor Gray
    Write-Host "  https://www.infracost.io/docs/" -ForegroundColor Blue
    exit 1
}

# Check for API key
if ([string]::IsNullOrEmpty($env:INFRACOST_API_KEY)) {
    Write-Host "WARNING: INFRACOST_API_KEY not set" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Get your free API key from: https://dashboard.infracost.io/" -ForegroundColor Yellow
    Write-Host "Then set it: `$env:INFRACOST_API_KEY = 'your-api-key'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Continuing without API key (limited features)..." -ForegroundColor Gray
    Write-Host ""
}

# Navigate to Terraform directory
$terraformDir = "platform\terraform"
if (!(Test-Path $terraformDir)) {
    Write-Host "ERROR: Terraform directory not found: $terraformDir" -ForegroundColor Red
    exit 1
}

Push-Location $terraformDir

try {
    Write-Host "Working directory: $((Get-Location).Path)" -ForegroundColor Cyan
    Write-Host "Environment: $Environment" -ForegroundColor Cyan
    Write-Host ""

    # Check if Terraform is initialized
    if (!(Test-Path ".terraform")) {
        Write-Host "Terraform not initialized. Running terraform init..." -ForegroundColor Yellow
        terraform init -backend=false
        Write-Host ""
    }

    # Sync usage file if requested
    if ($SyncUsage) {
        Write-Host "=== Syncing Usage File ===" -ForegroundColor Cyan
        Write-Host "This will update usage estimates based on actual AWS usage..." -ForegroundColor Yellow
        Write-Host ""

        infracost breakdown --path . --sync-usage-file --usage-file ".infracost/usage-$Environment.yml"

        Write-Host ""
        Write-Host "Usage file updated!" -ForegroundColor Green
        Write-Host ""
    }

    # Run Infracost breakdown
    Write-Host "=== Generating Cost Breakdown ===" -ForegroundColor Cyan

    $tfvarsFile = "env\$Environment.tfvars"
    if (!(Test-Path $tfvarsFile)) {
        Write-Host "WARNING: tfvars file not found: $tfvarsFile" -ForegroundColor Yellow
        Write-Host "Running without tfvars..." -ForegroundColor Yellow
        $tfvarsArg = ""
    } else {
        $tfvarsArg = "--terraform-var-file=$tfvarsFile"
    }

    # Check for usage file
    $usageFile = ".infracost\usage-$Environment.yml"
    if (Test-Path $usageFile) {
        $usageArg = "--usage-file=$usageFile"
        Write-Host "Using usage file: $usageFile" -ForegroundColor Cyan
    } else {
        $usageArg = ""
        Write-Host "No usage file found (using defaults)" -ForegroundColor Gray
    }

    # Generate breakdown
    Write-Host ""
    Write-Host "Running: infracost breakdown --path . $tfvarsArg $usageArg" -ForegroundColor Gray
    Write-Host ""

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outputDir = ".infracost"
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

    # Generate JSON output
    infracost breakdown --path . $tfvarsArg $usageArg --format json --out-file "$outputDir\out-$timestamp.json"

    # Generate table output
    infracost breakdown --path . $tfvarsArg $usageArg --format table | Tee-Object -FilePath "$outputDir\infracost-report-$timestamp.txt"

    # Generate HTML report
    Write-Host ""
    Write-Host "Generating HTML report..." -ForegroundColor Yellow
    infracost output --path "$outputDir\out-$timestamp.json" --format html --out-file "$outputDir\infracost-report-$timestamp.html"

    # Update symlinks/copies for latest reports
    Copy-Item "$outputDir\out-$timestamp.json" "$outputDir\out-latest.json" -Force
    Copy-Item "$outputDir\infracost-report-$timestamp.txt" "$outputDir\infracost-report.txt" -Force
    Copy-Item "$outputDir\infracost-report-$timestamp.html" "$outputDir\infracost-report.html" -Force

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Cost Estimates Updated!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Reports saved to:" -ForegroundColor Yellow
    Write-Host "  Text:  $outputDir\infracost-report.txt" -ForegroundColor White
    Write-Host "  HTML:  $outputDir\infracost-report.html" -ForegroundColor White
    Write-Host "  JSON:  $outputDir\out-latest.json" -ForegroundColor White
    Write-Host ""

    # Extract and display summary
    $reportContent = Get-Content "$outputDir\infracost-report.txt" -Raw
    if ($reportContent -match 'OVERALL TOTAL.*\$([0-9,]+\.[0-9]{2})') {
        $monthlyTotal = $Matches[1]
        $hourlyTotal = ([decimal]$monthlyTotal.Replace(',', '')) / 730

        Write-Host "Estimated Costs:" -ForegroundColor Cyan
        Write-Host ("  Monthly: ${0}" -f $monthlyTotal) -ForegroundColor Green
        Write-Host ("  Hourly:  ${0:F4}/hour" -f $hourlyTotal) -ForegroundColor Green
        Write-Host ""
    }

    # Open HTML report
    Write-Host "Opening HTML report in browser..." -ForegroundColor Yellow
    Start-Process "$outputDir\infracost-report.html"

    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Review the HTML report" -ForegroundColor Gray
    Write-Host "  2. Compare with actual costs: .\scripts\aws\get-current-costs.ps1 -CompareInfracost" -ForegroundColor Gray
    Write-Host "  3. Update usage file if needed: .\scripts\aws\update-cost-estimates.ps1 -SyncUsage" -ForegroundColor Gray
    Write-Host ""

} finally {
    Pop-Location
}
