<#
.SYNOPSIS
    Deploy ScroogeBank CRM infrastructure to LearnerLab, integration, or prod.

.DESCRIPTION
    Runs terraform init -> plan -> apply (or destroy) for the target environment.

    Credentials:
      lab  - LearnerLab credentials expire every 4 hours. Set them in your shell
             before running, or this script will prompt you to paste them from
             the LearnerLab portal (AWS Details > AWS CLI).
      integration/prod - Credentials must be set in your shell as
                         AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY before running.

    Sensitive Terraform variables (TF_VAR_jwt_hmac_secret,
    TF_VAR_root_admin_password) are read from the environment; if not set you
    will be prompted for them.

.PARAMETER Env
    Target environment: 'lab', 'integration', or 'prod'.

.PARAMETER PlanOnly
    Run terraform plan but skip apply.

.PARAMETER Destroy
    Run terraform destroy instead of apply.

.PARAMETER AutoApprove
    Skip the confirmation prompt before apply/destroy.

.EXAMPLE
    # Plan-only for lab (paste creds when prompted):
    .\scripts\deploy\deploy-aws.ps1 -Env lab -PlanOnly

.EXAMPLE
    # Deploy to lab (creds already in env):
    $env:AWS_ACCESS_KEY_ID     = "ASIA..."
    $env:AWS_SECRET_ACCESS_KEY = "..."
    $env:AWS_SESSION_TOKEN     = "..."
    .\scripts\deploy\deploy-aws.ps1 -Env lab

.EXAMPLE
    # Deploy to integration:
    $env:AWS_ACCESS_KEY_ID     = "AKIA..."
    $env:AWS_SECRET_ACCESS_KEY = "..."
    .\scripts\deploy\deploy-aws.ps1 -Env integration

.EXAMPLE
    # Deploy to prod:
    $env:AWS_ACCESS_KEY_ID     = "AKIA..."
    $env:AWS_SECRET_ACCESS_KEY = "..."
    .\scripts\deploy\deploy-aws.ps1 -Env prod

.EXAMPLE
    # Destroy lab infrastructure:
    .\scripts\deploy\deploy-aws.ps1 -Env lab -Destroy
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("lab", "integration", "prod")]
    [string]$Env,

    [switch]$PlanOnly,
    [switch]$Destroy,
    [switch]$AutoApprove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot   = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$tfDir      = Join-Path $repoRoot "platform\terraform"
$backendHcl = Join-Path $tfDir "env\$Env.backend.hcl"
$tfvarsFile = Join-Path $tfDir "env\$Env.tfvars"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host ("=" * 60)
    Write-Host " $msg"
    Write-Host ("=" * 60)
}

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "[STEP] $msg"
}

function Invoke-Tf([string[]]$tfArgs) {
    $display = "terraform " + ($tfArgs -join " ")
    Write-Step $display
    & terraform @tfArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] $display (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

function Test-AwsCreds {
    $null = aws sts get-caller-identity 2>&1
    return $LASTEXITCODE -eq 0
}

# ---------------------------------------------------------------------------
# 1. Verify required tools
# ---------------------------------------------------------------------------
foreach ($tool in @("terraform", "aws")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] '$tool' not found in PATH. Please install it and retry."
        exit 1
    }
}

if (-not (Test-Path $backendHcl)) {
    Write-Host "[ERROR] Backend config not found: $backendHcl"
    exit 1
}
if (-not (Test-Path $tfvarsFile)) {
    Write-Host "[ERROR] tfvars not found: $tfvarsFile"
    exit 1
}

# ---------------------------------------------------------------------------
# 2. AWS credentials
#    lab                   - try env vars first; if invalid, prompt for paste from portal
#    integration / prod    - env vars only (long-lived credentials, no paste flow)
# ---------------------------------------------------------------------------
if ($Env -eq "lab") {
    $env:AWS_DEFAULT_REGION = "us-east-1"

    if (-not (Test-AwsCreds)) {
        Write-Header "LearnerLab Credentials"
        Write-Host ""
        Write-Host "  Your LearnerLab credentials are missing or expired."
        Write-Host "  1. Open the LearnerLab portal"
        Write-Host "  2. Click 'AWS Details' -> 'AWS CLI'"
        Write-Host "  3. Copy the three lines and paste below, then press Enter twice."
        Write-Host ""
        Write-Host "  Expected format:"
        Write-Host "    [default]"
        Write-Host "    aws_access_key_id=ASIA..."
        Write-Host "    aws_secret_access_key=..."
        Write-Host "    aws_session_token=..."
        Write-Host ""
        Write-Host "  (Alternatively, set env vars before running this script:"
        Write-Host "   `$env:AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)"
        Write-Host ""

        $lines = [System.Collections.Generic.List[string]]::new()
        Write-Host "Paste credentials (empty line when done):"
        while ($true) {
            $line = Read-Host
            if ([string]::IsNullOrWhiteSpace($line)) { break }
            $lines.Add($line)
        }

        foreach ($line in $lines) {
            if ($line -match "^\s*aws_access_key_id\s*=\s*(.+)$") {
                $env:AWS_ACCESS_KEY_ID = $Matches[1].Trim()
            } elseif ($line -match "^\s*aws_secret_access_key\s*=\s*(.+)$") {
                $env:AWS_SECRET_ACCESS_KEY = $Matches[1].Trim()
            } elseif ($line -match "^\s*aws_session_token\s*=\s*(.+)$") {
                $env:AWS_SESSION_TOKEN = $Matches[1].Trim()
            }
        }

        if (-not (Test-AwsCreds)) {
            Write-Host ""
            Write-Host "[ERROR] Credentials are still invalid. Check you copied all three lines."
            exit 1
        }
    }

} else {
    # integration/prod - must already be set
    $env:AWS_DEFAULT_REGION = "ap-southeast-1"

    if (-not (Test-AwsCreds)) {
        Write-Host ""
        Write-Host "[ERROR] No valid AWS credentials found for $Env."
        Write-Host "  Set them before running:"
        Write-Host "    `$env:AWS_ACCESS_KEY_ID     = 'AKIA...'"
        Write-Host "    `$env:AWS_SECRET_ACCESS_KEY = '...'"
        Write-Host "  (Add AWS_SESSION_TOKEN if using temporary credentials.)"
        exit 1
    }
}

Write-Host ""
Write-Host "[OK] Credentials valid:"
aws sts get-caller-identity

# ---------------------------------------------------------------------------
# 3. Sensitive Terraform variables (jwt_hmac_secret, root_admin_password)
#    Read from env if set; prompt securely if not.
# ---------------------------------------------------------------------------
foreach ($varName in @("TF_VAR_jwt_hmac_secret", "TF_VAR_root_admin_password")) {
    if (-not [System.Environment]::GetEnvironmentVariable($varName)) {
        Write-Host ""
        Write-Host "[INPUT] $varName is not set."
        $secure = Read-Host "  Enter value for $varName" -AsSecureString
        $plain  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        )
        [System.Environment]::SetEnvironmentVariable($varName, $plain)
    }
}

# ---------------------------------------------------------------------------
# 4. Terraform workflow
# ---------------------------------------------------------------------------
Write-Header "Deploying to '$Env'"
Write-Host " backend : $backendHcl"
Write-Host " tfvars  : $tfvarsFile"
if ($Destroy)  { Write-Host " mode    : DESTROY" }
elseif ($PlanOnly) { Write-Host " mode    : plan only" }
else           { Write-Host " mode    : apply" }

$planFile   = if ($Destroy) { "tfplan-destroy" } else { "tfplan" }
$varFileArg = "-var-file=env\$Env.tfvars"

Push-Location $tfDir
try {
    # init
    Invoke-Tf @("init", "-reconfigure", "-backend-config=env\$Env.backend.hcl")

    # plan
    if ($Destroy) {
        Invoke-Tf @("plan", "-destroy", $varFileArg, "-out=$planFile")
    } else {
        Invoke-Tf @("plan", $varFileArg, "-out=$planFile")
    }

    if ($PlanOnly) {
        Write-Host ""
        Write-Host "[DONE] Plan complete. Review the output above."
        Write-Host "       Re-run without -PlanOnly to apply."
        exit 0
    }

    # confirmation
    if (-not $AutoApprove) {
        Write-Host ""
        $verb    = if ($Destroy) { "DESTROY" } else { "apply" }
        $confirm = Read-Host "Apply the above plan to '$Env' ($verb)? [yes/N]"
        if ($confirm -ne "yes") {
            Write-Host "Aborted."
            exit 0
        }
    }

    # apply / destroy
    Invoke-Tf @("apply", $planFile)

    Write-Host ""
    $verb = if ($Destroy) { "destroy" } else { "deploy" }
    Write-Host "[DONE] $verb to '$Env' complete."

} finally {
    if (Test-Path $planFile) { Remove-Item $planFile -ErrorAction SilentlyContinue }
    Pop-Location
}

