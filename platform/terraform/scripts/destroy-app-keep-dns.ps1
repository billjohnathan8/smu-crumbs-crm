param(
  [string]$Environment = "prod",
  [string]$ExtraVarFile = ""
)

$ErrorActionPreference = "Stop"

# Destroys app infrastructure while keeping critical DNS alias records in Route53.
# It detaches protected DNS records from Terraform state before destroy.
#
# Usage:
#   ./scripts/destroy-app-keep-dns.ps1 -Environment prod
#   ./scripts/destroy-app-keep-dns.ps1 -Environment prod -ExtraVarFile runtime.auto.tfvars

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  throw "terraform is required but was not found in PATH."
}

$envVarFile = "env/$Environment.tfvars"
if (-not (Test-Path -LiteralPath $envVarFile)) {
  throw "Missing var-file: $envVarFile"
}

$stateAddresses = @()
try {
  $stateAddresses = terraform state list
} catch {
  # No state yet, continue.
  $stateAddresses = @()
}

$targets = @(
  "module.alb.aws_route53_record.alb[0]",
  "module.cloudfront[0].aws_route53_record.cloudfront[0]",
  "aws_route53_record.cloudfront_backend_origin[0]"
)

foreach ($target in $targets) {
  if ($stateAddresses -contains $target) {
    Write-Host "Detaching from state: $target"
    terraform state rm $target | Out-Null
  }
}

$tfArgs = @(
  "destroy",
  "-auto-approve",
  "-var-file=$envVarFile"
)

if (Test-Path -LiteralPath "runtime.auto.tfvars") {
  $tfArgs += "-var-file=runtime.auto.tfvars"
}

if ($ExtraVarFile -ne "") {
  if (-not (Test-Path -LiteralPath $ExtraVarFile)) {
    throw "Extra var-file not found: $ExtraVarFile"
  }
  $tfArgs += "-var-file=$ExtraVarFile"
}

Write-Host ("Running: terraform " + ($tfArgs -join " "))
terraform @tfArgs
