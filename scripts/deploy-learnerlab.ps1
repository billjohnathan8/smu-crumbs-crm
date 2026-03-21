<#
.SYNOPSIS
    One-command first-time LearnerLab deployment for ScroogeBank CRM.

.DESCRIPTION
    Automates the entire BILL_LEARNERLAB_RUNBOOK.md:
      Phase 1: Build JARs + Docker images (no AWS needed)
      Phase 2: Create TF backend, terraform init/plan/apply
      Phase 3: ECR login, push images, force ECS redeploy
      Phase 4: Build frontend, upload to S3
      Phase 5: Health checks + login info

    Pauses for manual approval before terraform apply.

    Bash equivalent: scripts/deploy-learnerlab.sh

.PARAMETER SkipBuild
    Skip Phase 1 (JAR compilation + Docker image build).

.PARAMETER SkipInfra
    Skip Phase 2 (Terraform init/plan/apply).

.PARAMETER SkipFrontend
    Skip Phase 4 (frontend build + S3 upload).

.EXAMPLE
    # Full first-time deployment (interactive - prompts for AWS creds):
    .\scripts\deploy-learnerlab.ps1

.EXAMPLE
    # Re-deploy after code change (skip infra):
    .\scripts\deploy-learnerlab.ps1 -SkipInfra

.EXAMPLE
    # Frontend-only re-deploy:
    .\scripts\deploy-learnerlab.ps1 -SkipBuild -SkipInfra

.EXAMPLE
    # Infra-only change (skip builds):
    .\scripts\deploy-learnerlab.ps1 -SkipBuild -SkipFrontend
#>

param(
    [switch]$SkipBuild,
    [switch]$SkipInfra,
    [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================
# Paths (derived from script location, not hardcoded)
# ============================================================
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT = (Resolve-Path (Join-Path $SCRIPT_DIR "..")).Path
$TF_DIR = Join-Path $ROOT "platform" "terraform"
$FRONTEND_DIR = Join-Path $ROOT "services" "frontend" "crm-ui"
$REGION = "us-east-1"
$PROJECT_NAME = "scroogebank-crm"
$ENVIRONMENT = "lab"
$NAME_PREFIX = "$PROJECT_NAME-$ENVIRONMENT"
$ECS_CLUSTER = "$NAME_PREFIX-ecs"

$SERVICES = @("user", "client", "transaction")
$IMAGE_TAGS = @{
    user        = "user-lab-001"
    client      = "client-lab-001"
    transaction = "transaction-lab-001"
}

# Detect gradlew command based on platform
if ($IsLinux -or $IsMacOS) {
    $GRADLEW = "./gradlew"
} else {
    $GRADLEW = ".\gradlew.bat"
}

# ============================================================
# Helper functions
# ============================================================

function Write-Phase {
    param([string]$Phase, [string]$Title)
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $Phase - $Title" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Msg)
    Write-Host "[*] $Msg" -ForegroundColor Yellow
}

function Write-OK {
    param([string]$Msg)
    Write-Host "[OK] $Msg" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Msg)
    Write-Host "[FAIL] $Msg" -ForegroundColor Red
}

function Invoke-Checked {
    param([string]$Description, [scriptblock]$Command)
    Write-Step $Description
    try {
        & $Command
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "Command exited with code $LASTEXITCODE"
        }
        Write-OK $Description
    }
    catch {
        Write-Fail "$Description`n    $_"
        throw
    }
}

function Pause-ForApproval {
    param([string]$Msg)
    Write-Host ""
    Write-Host $Msg -ForegroundColor Magenta
    $response = Read-Host "Continue? (y/n)"
    if ($response -notmatch '^[yY]') {
        Write-Host "Aborted by user." -ForegroundColor Red
        exit 1
    }
}

# ============================================================
# PRE-FLIGHT CHECKS
# ============================================================
Write-Phase "Phase 0" "Pre-flight checks"

$requiredTools = @("java", "docker", "terraform", "aws", "node", "npm")

$missing = @()
foreach ($tool in $requiredTools) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) {
        Write-OK "$tool found"
    }
    else {
        Write-Fail "$tool not found"
        $missing += $tool
    }
}

if ($missing.Count -gt 0) {
    Write-Host "`nMissing tools: $($missing -join ', '). Install them and re-run." -ForegroundColor Red
    exit 1
}

# ============================================================
# AWS CREDENTIALS
# ============================================================
Write-Phase "Credentials" "AWS Learner Lab session credentials"

Write-Host "Paste your AWS Learner Lab credentials (from AWS Details -> AWS CLI)." -ForegroundColor Yellow
Write-Host "Leave blank and press Enter to keep existing env vars (if already set).`n" -ForegroundColor DarkGray

$inputAccessKey = Read-Host "AWS_ACCESS_KEY_ID     (current: $($env:AWS_ACCESS_KEY_ID))"
$inputSecretKey = Read-Host "AWS_SECRET_ACCESS_KEY (current: [hidden])"
$inputToken     = Read-Host "AWS_SESSION_TOKEN     (current: [hidden])"

if ($inputAccessKey) { $env:AWS_ACCESS_KEY_ID     = $inputAccessKey.Trim() }
if ($inputSecretKey) { $env:AWS_SECRET_ACCESS_KEY = $inputSecretKey.Trim() }
if ($inputToken)     { $env:AWS_SESSION_TOKEN     = $inputToken.Trim() }
$env:AWS_DEFAULT_REGION = $REGION

# Validate credentials
Write-Step "Validating AWS credentials..."
$callerJson = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "AWS credentials invalid or expired. Re-start Learner Lab session and try again."
    Write-Host $callerJson -ForegroundColor Red
    exit 1
}
Write-Host $callerJson -ForegroundColor DarkGray
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
Write-OK "Authenticated. Account ID: $ACCOUNT_ID"

# Set Terraform secret
$env:TF_VAR_root_admin_password = "Scrooge@Bank2026!"

# Compute ECR values
$REGISTRY = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
$ECR_REPOS = @{
    user        = "$REGISTRY/$NAME_PREFIX-user"
    client      = "$REGISTRY/$NAME_PREFIX-client"
    transaction = "$REGISTRY/$NAME_PREFIX-transaction"
}

# ============================================================
# PHASE 1 - BUILD BACKEND IMAGES
# ============================================================
if (-not $SkipBuild) {
    Write-Phase "Phase 1" "Build JARs + Docker images (local, no AWS needed)"

    foreach ($svc in $SERVICES) {
        $svcDir = Join-Path $ROOT "services" "backend" $svc
        $tag    = $IMAGE_TAGS[$svc]
        $repo   = $ECR_REPOS[$svc]

        Invoke-Checked "Build JAR: $svc" {
            Push-Location $svcDir
            try { & $GRADLEW build -x test }
            finally { Pop-Location }
        }

        Invoke-Checked "Build Docker image: ${repo}:${tag}" {
            docker build --provenance=false --platform linux/amd64 -t "${repo}:${tag}" "$svcDir"
        }
    }

    Write-OK "All 3 backend images built and stored in local Docker."
}
else {
    Write-Host "Skipping build (-SkipBuild flag)." -ForegroundColor DarkGray
}

# ============================================================
# PHASE 2 - INFRASTRUCTURE (Terraform)
# ============================================================
if (-not $SkipInfra) {
    Write-Phase "Phase 2" "Infrastructure provisioning (Terraform)"

    # --- 2a: Create remote state backend (idempotent) ---
    $BUCKET_NAME = "scroogebank-crm-lab-tfstate-$ACCOUNT_ID"

    Write-Step "Creating S3 state bucket: $BUCKET_NAME (idempotent)..."
    $null = aws s3api head-bucket --bucket $BUCKET_NAME 2>&1
    if ($LASTEXITCODE -ne 0) {
        aws s3api create-bucket --bucket $BUCKET_NAME --region $REGION
        aws s3api put-bucket-versioning --bucket $BUCKET_NAME --versioning-configuration Status=Enabled
        Write-OK "S3 bucket created: $BUCKET_NAME"
    }
    else {
        Write-OK "S3 bucket already exists: $BUCKET_NAME"
    }

    Write-Step "Creating DynamoDB lock table: scroogebank-crm-lab-tflock (idempotent)..."
    $null = aws dynamodb describe-table --table-name scroogebank-crm-lab-tflock --region $REGION 2>&1
    if ($LASTEXITCODE -ne 0) {
        aws dynamodb create-table --table-name scroogebank-crm-lab-tflock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region $REGION
        aws dynamodb wait table-exists --table-name scroogebank-crm-lab-tflock --region $REGION
        Write-OK "DynamoDB table created."
    }
    else {
        Write-OK "DynamoDB table already exists."
    }

    # --- 2b: Terraform init ---
    Push-Location $TF_DIR
    try {
        Invoke-Checked "terraform init" {
            terraform init -backend-config "env/lab.backend.hcl" -backend-config "bucket=$BUCKET_NAME" -reconfigure
        }

        # --- 2c: Terraform plan (with review) ---
        Invoke-Checked "terraform plan" {
            terraform plan -var-file="env/lab.tfvars" -out="lab.tfplan"
        }

        terraform show -no-color lab.tfplan > plan.txt
        Write-Host "`nPlan saved to platform/terraform/plan.txt" -ForegroundColor DarkGray

        Pause-ForApproval "Review the plan above. Ready to apply? (This takes 15-25 minutes)"

        # --- 2d: Terraform apply ---
        Invoke-Checked "terraform apply" {
            terraform apply "lab.tfplan"
        }

        # Save outputs
        terraform output -json | Out-File lab-outputs.json -Encoding utf8
        Write-OK "Terraform outputs saved to lab-outputs.json"
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Skipping infrastructure (-SkipInfra flag)." -ForegroundColor DarkGray
}

# ============================================================
# PHASE 3 - PUSH IMAGES TO ECR
# ============================================================
Write-Phase "Phase 3" "Push images to ECR + force ECS redeploy"

# ECR login - use cmd /c on Windows to avoid PowerShell pipe adding \r\n to token
if ($IsLinux -or $IsMacOS) {
    Invoke-Checked "Docker login to ECR" {
        aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
    }
} else {
    Invoke-Checked "Docker login to ECR" {
        cmd /c "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY"
    }
}

# Push images
foreach ($svc in $SERVICES) {
    $tag  = $IMAGE_TAGS[$svc]
    $repo = $ECR_REPOS[$svc]

    Invoke-Checked "Push image: ${repo}:${tag}" {
        docker push "${repo}:${tag}"
    }
}

# Force ECS redeploy
foreach ($svc in $SERVICES) {
    $ecsService = "$NAME_PREFIX-$svc"
    Invoke-Checked "Force redeploy: $ecsService" {
        aws ecs update-service --cluster $ECS_CLUSTER --service $ecsService --force-new-deployment --region $REGION --output text --query "service.serviceName"
    }
}

# ============================================================
# PHASE 4 - FRONTEND DEPLOYMENT
# ============================================================
if (-not $SkipFrontend) {
    Write-Phase "Phase 4" "Frontend build + S3 upload"

    Push-Location $TF_DIR
    try {
        $ALB    = terraform output -raw alb_dns_name
        $BUCKET = terraform output -raw frontend_bucket_name
    }
    finally {
        Pop-Location
    }

    # Create .env.production
    $envContent = "VITE_API_BASE_URL=http://$ALB"
    [System.IO.File]::WriteAllText((Join-Path $FRONTEND_DIR ".env.production"), $envContent)
    Write-OK ".env.production -> VITE_API_BASE_URL=http://$ALB"

    Push-Location $FRONTEND_DIR
    try {
        Invoke-Checked "npm install" { npm install }
        Invoke-Checked "npm run build" { npm run build }
        Invoke-Checked "S3 sync frontend to s3://$BUCKET/" {
            aws s3 sync dist/ "s3://$BUCKET/" --delete
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Skipping frontend (-SkipFrontend flag)." -ForegroundColor DarkGray
}

# ============================================================
# PHASE 5 - VERIFICATION
# ============================================================
Write-Phase "Phase 5" "Verification"

Push-Location $TF_DIR
try {
    $ALB          = terraform output -raw alb_dns_name
    $FRONTEND_URL = terraform output -raw frontend_website_url
}
finally {
    Pop-Location
}

# ECS service status
Write-Step "Checking ECS service status..."
aws ecs describe-services --cluster $ECS_CLUSTER --services ($SERVICES | ForEach-Object { "$NAME_PREFIX-$_" }) --region $REGION --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,status:status}" --output table

# Health checks (with retries - ECS tasks may still be starting)
Write-Step "Waiting 30 seconds for ECS tasks to stabilize..."
Start-Sleep -Seconds 30

$healthEndpoints = @(
    "/api/user/health",
    "/api/clients/health",
    "/api/transactions/health"
)

# Use curl.exe on Windows (avoid PowerShell's Invoke-WebRequest alias), curl on Linux/Mac
$curlCmd = if ($IsLinux -or $IsMacOS) { "curl" } else { "curl.exe" }

$allHealthy = $true
foreach ($endpoint in $healthEndpoints) {
    $url = "http://$ALB$endpoint"
    Write-Step "Health check: $url"
    try {
        $response = & $curlCmd -s -o NUL -w "%{http_code}" $url 2>&1
        if ($response -eq "200") {
            Write-OK "$endpoint -> 200 OK"
        }
        else {
            Write-Fail "$endpoint -> HTTP $response (ECS tasks may still be starting - check again in a few minutes)"
            $allHealthy = $false
        }
    }
    catch {
        Write-Fail "$endpoint -> failed: $_"
        $allHealthy = $false
    }
}

# ============================================================
# SUMMARY
# ============================================================
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""
Write-Host "  ALB endpoint:    http://$ALB" -ForegroundColor White
Write-Host "  Frontend URL:    $FRONTEND_URL" -ForegroundColor White
Write-Host ""
Write-Host "  Login credentials:" -ForegroundColor White
Write-Host "    Email:    admin@crm.local" -ForegroundColor White
Write-Host "    Password: Scrooge@Bank2026!" -ForegroundColor White
Write-Host ""

if (-not $allHealthy) {
    Write-Host "  NOTE: Some health checks failed. ECS tasks may still be starting." -ForegroundColor Yellow
    Write-Host "  Re-check in 2-3 minutes with:" -ForegroundColor Yellow
    Write-Host "    curl `"http://$ALB/api/user/health`"" -ForegroundColor DarkGray
    Write-Host "    curl `"http://$ALB/api/clients/health`"" -ForegroundColor DarkGray
    Write-Host "    curl `"http://$ALB/api/transactions/health`"" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  To re-deploy code changes later, use flags to skip phases:" -ForegroundColor DarkGray
Write-Host "    .\scripts\deploy-learnerlab.ps1 -SkipInfra              # rebuild + push + frontend" -ForegroundColor DarkGray
Write-Host "    .\scripts\deploy-learnerlab.ps1 -SkipBuild -SkipInfra   # frontend only" -ForegroundColor DarkGray
Write-Host "    .\scripts\deploy-learnerlab.ps1 -SkipBuild              # infra change only" -ForegroundColor DarkGray
Write-Host ""
