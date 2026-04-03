<#
.SYNOPSIS
    One-command first-time LearnerLab deployment for ScroogeBank CRM.

.DESCRIPTION
    Automates the entire BILL_LEARNERLAB_RUNBOOK.md:
      Phase 1: Build JARs + Docker images (no AWS needed)
      Phase 2: Create TF backend, terraform init, create ECR repos (targeted apply),
               push images, then full terraform plan/apply
               (images are in ECR before ECS services are created, preventing double-deployment)
      Phase 3: ECR login, push images (only when -SkipInfra; push done in Phase 2 otherwise)
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

.PARAMETER NoDestroyOnFail
    Skip automatic 'terraform destroy' when a step fails after infrastructure is provisioned.

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
    [switch]$SkipFrontend,
    [switch]$NoDestroyOnFail
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
$BUILT_SERVICES = @()
$IMAGE_TAGS = @{
    user        = "user-lab-001"
    client      = "client-lab-001"
    transaction = "transaction-lab-001"
}
$LOG_ROOT = Join-Path $ROOT "build-logs" "deploy-learnerlab"
$LOG_RETENTION_RUNS = 3

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

function Remove-OldRuns {
    param([int]$Keep = $LOG_RETENTION_RUNS)

    if (-not (Test-Path $LOG_ROOT)) {
        return
    }

    $runDirs = @(Get-ChildItem -Path $LOG_ROOT -Directory -ErrorAction SilentlyContinue |
        Sort-Object -Property Name -Descending)

    if ($runDirs.Count -le $Keep) {
        return
    }

    foreach ($oldRun in $runDirs[$Keep..($runDirs.Count - 1)]) {
        Remove-Item -Path $oldRun.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Initialize-RunDirectory {
    New-Item -ItemType Directory -Path $LOG_ROOT -Force | Out-Null
    Remove-OldRuns -Keep ([Math]::Max(0, $LOG_RETENTION_RUNS - 1))

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $runDir = Join-Path $LOG_ROOT $timestamp
    $collisionIdx = 1
    while (Test-Path $runDir) {
        $runDir = Join-Path $LOG_ROOT ("{0}_{1:00}" -f $timestamp, $collisionIdx)
        $collisionIdx += 1
    }

    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
    return $runDir
}

$script:ScriptTimer = [System.Diagnostics.Stopwatch]::StartNew()
$script:StepTimings = New-Object 'System.Collections.Generic.List[object]'
$script:RunStatus = "PASS"
$script:InfraProvisioned = $false
$script:EcrPushed = $false
$script:RunDir = Initialize-RunDirectory
$script:RunLog = Join-Path $script:RunDir "deploy-learnerlab.log"
$script:StepTimingsFile = Join-Path $script:RunDir "step-timings.csv"
$script:SummaryMd = Join-Path $script:RunDir "summary.md"
$script:LastSummaryMd = Join-Path $LOG_ROOT "last-run-summary.md"
$script:TranscriptStarted = $false

Set-Content -Path $script:StepTimingsFile -Value "status,duration_seconds,step" -Encoding utf8
try {
    Start-Transcript -Path $script:RunLog -Force | Out-Null
    $script:TranscriptStarted = $true
}
catch {
    Write-Warning "Unable to start transcript logging at '$($script:RunLog)': $($_.Exception.Message)"
}

function Add-StepTiming {
    param(
        [string]$Step,
        [string]$Status,
        [double]$DurationSeconds
    )

    $durationRounded = [Math]::Round($DurationSeconds, 1)
    $entry = [PSCustomObject]@{
        status           = $Status
        duration_seconds = $durationRounded
        step             = $Step
    }
    $script:StepTimings.Add($entry)

    $escapedStep = $Step -replace '"', '""'
    Add-Content -Path $script:StepTimingsFile -Value "$Status,$durationRounded,""$escapedStep""" -Encoding utf8
}

function Write-RunSummary {
    $totalSeconds = [Math]::Round($script:ScriptTimer.Elapsed.TotalSeconds, 1)
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("# Learner Lab Deploy Summary")
    $lines.Add("")
    $lines.Add("- Timestamp: ``$(Get-Date -Format o)``")
    $lines.Add("- Status: ``$($script:RunStatus)``")
    $lines.Add("- Total duration: ``${totalSeconds}s``")
    $lines.Add("- Run log: ``$($script:RunLog)``")
    $lines.Add("- Step timings (csv): ``$($script:StepTimingsFile)``")
    $lines.Add("")
    $lines.Add("| Status | Duration (s) | Step |")
    $lines.Add("|---|---:|---|")
    foreach ($entry in $script:StepTimings) {
        $lines.Add("| $($entry.status) | $($entry.duration_seconds) | $($entry.step) |")
    }

    $summaryContent = $lines -join "`n"
    Set-Content -Path $script:SummaryMd -Value $summaryContent -Encoding utf8
    Set-Content -Path $script:LastSummaryMd -Value $summaryContent -Encoding utf8
}

function Invoke-Checked {
    param([string]$Description, [scriptblock]$Command)
    Write-Step $Description
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        & $Command
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "Command exited with code $LASTEXITCODE"
        }
        $timer.Stop()
        Add-StepTiming -Step $Description -Status "PASS" -DurationSeconds $timer.Elapsed.TotalSeconds
        Write-OK ("{0} ({1:N1}s)" -f $Description, $timer.Elapsed.TotalSeconds)
    }
    catch {
        $timer.Stop()
        Add-StepTiming -Step $Description -Status "FAIL" -DurationSeconds $timer.Elapsed.TotalSeconds
        Write-Fail ("{0} ({1:N1}s)`n    {2}" -f $Description, $timer.Elapsed.TotalSeconds, $_)
        throw
    }
}

function Pause-ForApproval {
    param([string]$Msg)
    Write-Host ""
    Write-Host $Msg -ForegroundColor Magenta
    $response = Read-Host "Continue? (y/n)"
    if ($response -notmatch '^[yY]') {
        throw "Aborted by user."
    }
}

Write-Host "[*] Deployment logs directory: $($script:RunDir)" -ForegroundColor DarkGray

try {
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
        throw "Missing tools: $($missing -join ', '). Install them and re-run."
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
Invoke-Checked "Validating AWS credentials..." {
    $script:callerJson = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "AWS credentials invalid or expired. Re-start Learner Lab session and try again."
    }
}
Write-Host $script:callerJson -ForegroundColor DarkGray
Invoke-Checked "Resolving AWS account ID" {
    $script:ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($script:ACCOUNT_ID)) {
        throw "Unable to resolve AWS account ID."
    }
}
$ACCOUNT_ID = $script:ACCOUNT_ID
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
        $script:BUILT_SERVICES += $svc
    }

    Write-OK "All $($BUILT_SERVICES.Count) backend images built and stored in local Docker."
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

    Invoke-Checked "Creating S3 state bucket: $BUCKET_NAME (idempotent)..." {
        $null = aws s3api head-bucket --bucket $BUCKET_NAME 2>&1
        if ($LASTEXITCODE -ne 0) {
            aws s3api create-bucket --bucket $BUCKET_NAME --region $REGION
            aws s3api put-bucket-versioning --bucket $BUCKET_NAME --versioning-configuration Status=Enabled
            Write-OK "S3 bucket created: $BUCKET_NAME"
        }
        else {
            Write-OK "S3 bucket already exists: $BUCKET_NAME"
        }
    }

    Invoke-Checked "Creating DynamoDB lock table: scroogebank-crm-lab-tflock (idempotent)..." {
        $null = aws dynamodb describe-table --table-name scroogebank-crm-lab-tflock --region $REGION 2>&1
        if ($LASTEXITCODE -ne 0) {
            aws dynamodb create-table --table-name scroogebank-crm-lab-tflock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region $REGION
            aws dynamodb wait table-exists --table-name scroogebank-crm-lab-tflock --region $REGION
            Write-OK "DynamoDB table created."
        }
        else {
            Write-OK "DynamoDB table already exists."
        }
    }

    # --- 2b: Terraform init ---
    Push-Location $TF_DIR
    try {
        Invoke-Checked "terraform init" {
            terraform init -backend-config "env/lab.backend.hcl" -backend-config "bucket=$BUCKET_NAME" -reconfigure
        }

        # --- 2c: Create ECR repositories before pushing images ---
        # Images must be in ECR before ECS services are created. If we let the full
        # apply create ECS services first, tasks fail on image pull, the circuit breaker
        # fires a rollback, and you end up with two running tasks (old + rollback).
        Invoke-Checked "terraform apply (ECR repos only)" {
            terraform apply -target=module.ecr -var-file="env/lab.tfvars" -auto-approve
        }

        # --- 2d: Push images now that ECR repos exist ---
        if ($script:BUILT_SERVICES.Count -gt 0) {
            if ($IsLinux -or $IsMacOS) {
                Invoke-Checked "Docker login to ECR" {
                    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
                }
            } else {
                Invoke-Checked "Docker login to ECR" {
                    cmd /c "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY"
                }
            }

            foreach ($svc in $script:BUILT_SERVICES) {
                $tag  = $IMAGE_TAGS[$svc]
                $repo = $ECR_REPOS[$svc]
                Invoke-Checked "Push image: ${repo}:${tag}" {
                    docker push "${repo}:${tag}"
                }
            }

            Write-OK "All $($script:BUILT_SERVICES.Count) images pre-loaded into ECR before ECS services are created."
            $script:EcrPushed = $true
        }

        # --- 2e: Full plan + apply (ECS services find images in ECR immediately) ---
        Invoke-Checked "terraform plan" {
            terraform plan -var-file="env/lab.tfvars" -out="plan.out"
        }

        terraform show -no-color plan.out | Out-File plan.txt -Encoding utf8
        Write-Host "`nPlan saved to platform/terraform/plan.txt" -ForegroundColor DarkGray
        terraform show -json plan.out | Set-Content plan.json -Encoding utf8
        Write-Host "Plan JSON saved to platform/terraform/plan.json" -ForegroundColor DarkGray

        Pause-ForApproval "Review the plan above. Ready to apply? (This takes 15-25 minutes)"

        # --- 2f: Terraform apply ---
        $script:InfraProvisioned = $true  # set before apply so partial failures also trigger cleanup
        Invoke-Checked "terraform apply" {
            terraform apply "plan.out"
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
if ($script:BUILT_SERVICES.Count -gt 0 -and -not $script:EcrPushed) {
    # Only runs when -SkipInfra is set; otherwise images were already pushed in Phase 2.
    Write-Phase "Phase 3" "Push images to ECR"

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

    foreach ($svc in $script:BUILT_SERVICES) {
        $tag  = $IMAGE_TAGS[$svc]
        $repo = $ECR_REPOS[$svc]
        Invoke-Checked "Push image: ${repo}:${tag}" {
            docker push "${repo}:${tag}"
        }
    }

    Write-OK "All $($script:BUILT_SERVICES.Count) images pushed."
}
elseif ($script:BUILT_SERVICES.Count -eq 0) {
    Write-Host "Skipping Phase 3 (no images were built)." -ForegroundColor DarkGray
}
else {
    Write-Host "Skipping Phase 3 (images already pushed in Phase 2)." -ForegroundColor DarkGray
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
        $CLOUDFRONT_DISTRIBUTION_ID = terraform output -raw cloudfront_distribution_id 2>$null
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

        if (-not [string]::IsNullOrWhiteSpace($CLOUDFRONT_DISTRIBUTION_ID)) {
            Invoke-Checked "Create CloudFront invalidation for frontend hotfix" {
                aws cloudfront create-invalidation `
                    --distribution-id $CLOUDFRONT_DISTRIBUTION_ID `
                    --paths "/*"
            }
        }
        else {
            Write-Host "Skipping CloudFront invalidation (no distribution output available)." -ForegroundColor DarkGray
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
Invoke-Checked "Checking ECS service status..." {
    aws ecs describe-services --cluster $ECS_CLUSTER --services ($SERVICES | ForEach-Object { "$NAME_PREFIX-$_" }) --region $REGION --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,status:status}" --output table
}

# Health checks (with retries - ECS tasks may still be starting)
Invoke-Checked "Waiting 30 seconds for ECS tasks to stabilize..." {
    Start-Sleep -Seconds 30
}

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
    $healthTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Step "Health check: $url"
    try {
        $response = & $curlCmd -s -o NUL -w "%{http_code}" $url 2>&1
        $healthTimer.Stop()
        if ($response -eq "200") {
            Write-OK "$endpoint -> 200 OK"
            Add-StepTiming -Step "Health check: $url" -Status "PASS" -DurationSeconds $healthTimer.Elapsed.TotalSeconds
        }
        else {
            Write-Fail "$endpoint -> HTTP $response (ECS tasks may still be starting - check again in a few minutes)"
            $allHealthy = $false
            Add-StepTiming -Step "Health check: $url" -Status "FAIL" -DurationSeconds $healthTimer.Elapsed.TotalSeconds
        }
    }
    catch {
        $healthTimer.Stop()
        Write-Fail "$endpoint -> failed: $_"
        $allHealthy = $false
        Add-StepTiming -Step "Health check: $url" -Status "FAIL" -DurationSeconds $healthTimer.Elapsed.TotalSeconds
    }
}

if (-not $allHealthy -and $script:RunStatus -eq "PASS") {
    $script:RunStatus = "PASS_WITH_WARNINGS"
}

# ============================================================
# PHASE 6 - INFRASTRUCTURE DIAGRAMS
# ============================================================
Write-Phase "Phase 6" "Infrastructure diagrams"

$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) { $pythonCmd = "python" }
elseif (Get-Command python3 -ErrorAction SilentlyContinue) { $pythonCmd = "python3" }

if ($pythonCmd) {
    $tfStateFile = Join-Path $TF_DIR "terraform.tfstate"
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    # --- Pull state ---
    Write-Step "Pulling Terraform state..."
    $diagramTimer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Push-Location $TF_DIR
        try {
            $stateLines = terraform state pull
            $statePullExit = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }
        $diagramTimer.Stop()
        if ($statePullExit -eq 0 -and $stateLines) {
            $stateJson = $stateLines -join "`n"
            [System.IO.File]::WriteAllText($tfStateFile, $stateJson, (New-Object System.Text.UTF8Encoding $false))
            Add-StepTiming -Step "terraform state pull (inframap)" -Status "PASS" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
            Write-OK ("State pulled to $tfStateFile ({0:N1}s)" -f $diagramTimer.Elapsed.TotalSeconds)

            # --- Inframap diagram ---
            Write-Step "Generating inframap diagram..."
            $diagramTimer.Restart()
            & $pythonCmd "$ROOT\scripts\pipelines\generate_inframap.py" --source $tfStateFile --install-portable
            $diagramTimer.Stop()
            if ($LASTEXITCODE -eq 0) {
                Add-StepTiming -Step "generate inframap" -Status "PASS" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
                Write-OK ("Inframap diagram generated -> docs/infrastructure/generated/inframap/ ({0:N1}s)" -f $diagramTimer.Elapsed.TotalSeconds)
            }
            else {
                Add-StepTiming -Step "generate inframap" -Status "WARN" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
                Write-Host ("[WARN] Inframap diagram generation failed (non-fatal, {0:N1}s)." -f $diagramTimer.Elapsed.TotalSeconds) -ForegroundColor Yellow
            }
        }
        else {
            Add-StepTiming -Step "terraform state pull (inframap)" -Status "WARN" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
            Write-Host "[WARN] Could not pull Terraform state for inframap (non-fatal). Credentials may have expired." -ForegroundColor Yellow
        }
    }
    catch {
        $diagramTimer.Stop()
        Add-StepTiming -Step "terraform state pull (inframap)" -Status "WARN" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
        Write-Host "[WARN] Inframap state pull failed: $($_.Exception.Message) (non-fatal)." -ForegroundColor Yellow
    }

    # --- Full Terraform dependency graph ---
    Write-Step "Generating full Terraform dependency graph..."
    $diagramTimer.Restart()
    try {
        & $pythonCmd "$ROOT\scripts\pipelines\generate_inframap.py" --full-graph
        $diagramTimer.Stop()
        if ($LASTEXITCODE -eq 0) {
            Add-StepTiming -Step "generate terraform-graph" -Status "PASS" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
            Write-OK ("Full graph generated -> docs/infrastructure/generated/terraform-graph/ ({0:N1}s)" -f $diagramTimer.Elapsed.TotalSeconds)
        }
        else {
            Add-StepTiming -Step "generate terraform-graph" -Status "WARN" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
            Write-Host ("[WARN] Full Terraform graph generation failed (non-fatal, {0:N1}s)." -f $diagramTimer.Elapsed.TotalSeconds) -ForegroundColor Yellow
        }
    }
    catch {
        $diagramTimer.Stop()
        Add-StepTiming -Step "generate terraform-graph" -Status "WARN" -DurationSeconds $diagramTimer.Elapsed.TotalSeconds
        Write-Host "[WARN] Full graph generation failed: $($_.Exception.Message) (non-fatal)." -ForegroundColor Yellow
    }

    $ErrorActionPreference = $prevEAP
}
else {
    Write-Host "[WARN] Python not found; skipping infrastructure diagram generation." -ForegroundColor Yellow
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
Write-Host "  Logs directory:  $($script:RunDir)" -ForegroundColor White
Write-Host ""
Write-Host "  Login credentials:" -ForegroundColor White
Write-Host "    Email:    admin@crm.com" -ForegroundColor White
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
}
catch {
    $script:RunStatus = "FAIL"
    Write-Fail "Deployment failed: $($_.Exception.Message)"

    if ($script:InfraProvisioned -and -not $NoDestroyOnFail) {
        Write-Host ""
        Write-Host ("=" * 70) -ForegroundColor Red
        Write-Host "  DEPLOYMENT FAILED - Destroying Terraform infrastructure..." -ForegroundColor Red
        Write-Host "  (Use -NoDestroyOnFail to skip automatic cleanup)" -ForegroundColor DarkGray
        Write-Host ("=" * 70) -ForegroundColor Red
        Write-Host ""

        $destroyTimer = [System.Diagnostics.Stopwatch]::StartNew()
        Push-Location $TF_DIR
        try {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            terraform destroy -var-file="env/lab.tfvars" -auto-approve
            $ErrorActionPreference = $prevEAP
            $destroyTimer.Stop()
            if ($LASTEXITCODE -eq 0) {
                Add-StepTiming -Step "terraform destroy (auto-cleanup)" -Status "PASS" -DurationSeconds $destroyTimer.Elapsed.TotalSeconds
                Write-OK ("Terraform infrastructure destroyed ({0:N1}s)." -f $destroyTimer.Elapsed.TotalSeconds)
            }
            else {
                Add-StepTiming -Step "terraform destroy (auto-cleanup)" -Status "FAIL" -DurationSeconds $destroyTimer.Elapsed.TotalSeconds
                Write-Fail "terraform destroy failed. Run manually:"
                Write-Fail "  terraform -chdir='$TF_DIR' destroy -var-file='env/lab.tfvars'"
            }
        }
        catch {
            $destroyTimer.Stop()
            Add-StepTiming -Step "terraform destroy (auto-cleanup)" -Status "FAIL" -DurationSeconds $destroyTimer.Elapsed.TotalSeconds
            Write-Warning "Failed to destroy Terraform infrastructure: $($_.Exception.Message)"
            Write-Warning "Run manually: terraform -chdir='$TF_DIR' destroy -var-file='env/lab.tfvars'"
        }
        finally {
            Pop-Location
        }
    }

    throw
}
finally {
    Write-RunSummary
    Remove-OldRuns -Keep $LOG_RETENTION_RUNS
    if ($script:TranscriptStarted) {
        try {
            Stop-Transcript | Out-Null
        }
        catch {
            Write-Warning "Unable to stop transcript cleanly: $($_.Exception.Message)"
        }
    }
}
