<#
.SYNOPSIS
    Run Terraform init + plan for production without apply.

.DESCRIPTION
    Safe production preflight script:
      1. terraform init -reconfigure with env/prod.backend.hcl
      2. terraform plan with env/prod.tfvars

    This script never runs terraform apply.
    It also verifies the backend bucket is crumbs-scroogebank-tfstate.

.EXAMPLE
    .\scripts\deploy\plan-prod-no-apply.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$tfDir = Join-Path $repoRoot "platform\terraform"
$backendFile = Join-Path $tfDir "env\prod.backend.hcl"
$tfvarsFile = Join-Path $tfDir "env\prod.tfvars"
$planFile = "tfplan-prod-no-apply"

function Fail([string]$Message) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    exit 1
}

function Step([string]$Message) {
    Write-Host ""
    Write-Host "[STEP] $Message" -ForegroundColor Yellow
}

function Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

foreach ($tool in @("terraform", "aws")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Fail "'$tool' not found in PATH."
    }
}

if (-not (Test-Path $backendFile)) { Fail "Backend config not found: $backendFile" }
if (-not (Test-Path $tfvarsFile)) { Fail "tfvars not found: $tfvarsFile" }

$backendText = Get-Content -Path $backendFile -Raw
if ($backendText -notmatch 'bucket\s*=\s*"crumbs-scroogebank-tfstate"') {
    Fail "Expected backend bucket 'crumbs-scroogebank-tfstate' not found in $backendFile."
}

Step "Validating AWS credentials"
aws sts get-caller-identity | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "AWS credentials are invalid or expired." }
Ok "AWS credentials are valid."

Push-Location $tfDir
try {
    Step "terraform init (prod backend)"
    terraform init -reconfigure -backend-config="env/prod.backend.hcl"
    if ($LASTEXITCODE -ne 0) { Fail "terraform init failed." }
    Ok "terraform init complete."

    Step "terraform plan (prod tfvars, no apply)"
    terraform plan -var-file="env/prod.tfvars" -out=$planFile
    if ($LASTEXITCODE -ne 0) { Fail "terraform plan failed." }
    Ok "terraform plan complete."

    Step "Saving human-readable plan to plan-prod-no-apply.txt"
    terraform show -no-color $planFile | Out-File "plan-prod-no-apply.txt" -Encoding utf8
    Ok "Saved plan to platform/terraform/plan-prod-no-apply.txt"

    Write-Host ""
    Write-Host "[DONE] Plan-only run completed. No resources were applied." -ForegroundColor Cyan
}
finally {
    Pop-Location
}

