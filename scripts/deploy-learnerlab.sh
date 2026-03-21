#!/usr/bin/env bash
# ============================================================
# One-command first-time LearnerLab deployment for ScroogeBank CRM
#
# Bash equivalent of deploy-learnerlab.ps1.
# Automates the entire BILL_LEARNERLAB_RUNBOOK.md:
#   Phase 1: Build JARs + Docker images (no AWS needed)
#   Phase 2: Create TF backend, terraform init/plan/apply
#   Phase 3: ECR login, push images, deploy services (CodeDeploy or rolling update)
#   Phase 4: Build frontend, upload to S3
#   Phase 5: Health checks + login info
#
# Usage:
#   ./scripts/deploy-learnerlab.sh                          # full first-time deploy
#   ./scripts/deploy-learnerlab.sh --skip-build             # skip JAR/Docker build
#   ./scripts/deploy-learnerlab.sh --skip-infra             # skip Terraform
#   ./scripts/deploy-learnerlab.sh --skip-frontend          # skip frontend
#   ./scripts/deploy-learnerlab.sh --skip-build --skip-infra  # frontend only
# ============================================================
set -euo pipefail

# ============================================================
# Parse flags
# ============================================================
SKIP_BUILD=false
SKIP_INFRA=false
SKIP_FRONTEND=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-build)    SKIP_BUILD=true; shift ;;
        --skip-infra)    SKIP_INFRA=true; shift ;;
        --skip-frontend) SKIP_FRONTEND=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--skip-build] [--skip-infra] [--skip-frontend]"
            echo ""
            echo "Flags:"
            echo "  --skip-build     Skip Phase 1 (JAR + Docker image build)"
            echo "  --skip-infra     Skip Phase 2 (Terraform init/plan/apply)"
            echo "  --skip-frontend  Skip Phase 4 (frontend build + S3 upload)"
            exit 0
            ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# ============================================================
# Paths (derived from script location)
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$ROOT/platform/terraform"
FRONTEND_DIR="$ROOT/services/frontend/crm-ui"
REGION="us-east-1"
PROJECT_NAME="scroogebank-crm"
ENVIRONMENT="lab"
NAME_PREFIX="${PROJECT_NAME}-${ENVIRONMENT}"
ECS_CLUSTER="${NAME_PREFIX}-ecs"

SERVICES=(user client transaction)
BUILT_SERVICES=()
declare -A IMAGE_TAGS=(
    [user]="user-lab-001"
    [client]="client-lab-001"
    [transaction]="transaction-lab-001"
)

LOG_ROOT="${ROOT}/build-logs/deploy-learnerlab"
LOG_RETENTION_RUNS=3
SCRIPT_START_TS="$(date +%s)"
ALL_HEALTHY=true
STEP_TIMINGS=()
RUN_DIR=""
RUN_LOG=""
STEP_TIMINGS_FILE=""
SUMMARY_MD=""
LAST_SUMMARY_MD=""

# ============================================================
# Helpers
# ============================================================
phase()   { echo ""; echo "======================================================================"; echo "  $1 - $2"; echo "======================================================================"; echo ""; }
step()    { echo "[*] $1"; }
ok()      { echo "[OK] $1"; }
fail()    { echo "[FAIL] $1"; }

prune_old_runs() {
    local keep="$1"
    local run_dirs=()
    local old_dir

    mkdir -p "${LOG_ROOT}"
    mapfile -t run_dirs < <(find "${LOG_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)

    if [[ "${#run_dirs[@]}" -le "${keep}" ]]; then
        return
    fi

    for old_dir in "${run_dirs[@]:${keep}}"; do
        rm -rf "${LOG_ROOT}/${old_dir}"
    done
}

init_run_dir() {
    local pre_keep timestamp collision_idx candidate
    pre_keep=$((LOG_RETENTION_RUNS - 1))
    if (( pre_keep < 0 )); then
        pre_keep=0
    fi
    prune_old_runs "${pre_keep}"

    timestamp="$(date +%Y%m%d_%H%M%S)"
    candidate="${LOG_ROOT}/${timestamp}"
    collision_idx=1
    while [[ -e "${candidate}" ]]; do
        candidate="${LOG_ROOT}/${timestamp}_$(printf '%02d' "${collision_idx}")"
        collision_idx=$((collision_idx + 1))
    done

    mkdir -p "${candidate}"
    printf "%s" "${candidate}"
}

add_step_timing() {
    local step_name="$1"
    local status="$2"
    local elapsed="$3"
    STEP_TIMINGS+=("${status}|${elapsed}|${step_name}")
    printf "%s\t%s\t%s\n" "${status}" "${elapsed}" "${step_name}" >> "${STEP_TIMINGS_FILE}"
}

write_summary_files() {
    local exit_code="$1"
    local finished_at total_elapsed run_status entry status elapsed step_name

    finished_at="$(date -Iseconds)"
    total_elapsed=$(( $(date +%s) - SCRIPT_START_TS ))
    run_status="PASS"
    if [[ "${exit_code}" -ne 0 ]]; then
        run_status="FAIL"
    elif [[ "${ALL_HEALTHY}" == "false" ]]; then
        run_status="PASS_WITH_WARNINGS"
    fi

    {
        echo "# Learner Lab Deploy Summary"
        echo ""
        echo "- Timestamp: \`${finished_at}\`"
        echo "- Status: \`${run_status}\`"
        echo "- Total duration: \`${total_elapsed}s\`"
        echo "- Run log: \`${RUN_LOG}\`"
        echo "- Step timings (tsv): \`${STEP_TIMINGS_FILE}\`"
        echo ""
        echo "| Status | Duration (s) | Step |"
        echo "|---|---:|---|"
        for entry in "${STEP_TIMINGS[@]}"; do
            IFS='|' read -r status elapsed step_name <<< "${entry}"
            echo "| ${status} | ${elapsed} | ${step_name} |"
        done
    } > "${SUMMARY_MD}"

    cp "${SUMMARY_MD}" "${LAST_SUMMARY_MD}"
}

finalize_logging() {
    local exit_code="$1"
    write_summary_files "${exit_code}"
    prune_old_runs "${LOG_RETENTION_RUNS}"
}

run_checked() {
    local desc="$1"; shift
    local started_at ended_at elapsed
    step "$desc"
    started_at="$(date +%s)"
    if "$@"; then
        ended_at="$(date +%s)"
        elapsed=$((ended_at - started_at))
        add_step_timing "$desc" "PASS" "${elapsed}"
        ok "$desc (${elapsed}s)"
    else
        ended_at="$(date +%s)"
        elapsed=$((ended_at - started_at))
        add_step_timing "$desc" "FAIL" "${elapsed}"
        fail "$desc (${elapsed}s)"
        exit 1
    fi
}

pause_for_approval() {
    echo ""
    echo "$1"
    read -rp "Continue? (y/n) " response
    if [[ ! "$response" =~ ^[yY] ]]; then
        echo "Aborted by user."
        exit 1
    fi
}

RUN_DIR="$(init_run_dir)"
RUN_LOG="${RUN_DIR}/deploy-learnerlab.log"
STEP_TIMINGS_FILE="${RUN_DIR}/step-timings.tsv"
SUMMARY_MD="${RUN_DIR}/summary.md"
LAST_SUMMARY_MD="${LOG_ROOT}/last-run-summary.md"
printf "status\tduration_seconds\tstep\n" > "${STEP_TIMINGS_FILE}"
exec > >(tee -a "${RUN_LOG}") 2>&1
trap 'finalize_logging $?' EXIT
step "Deployment logs directory: ${RUN_DIR}"

# ============================================================
# PRE-FLIGHT CHECKS
# ============================================================
phase "Phase 0" "Pre-flight checks"

REQUIRED_TOOLS=(java docker terraform aws node npm)
MISSING=()
for tool in "${REQUIRED_TOOLS[@]}"; do
    if command -v "$tool" &>/dev/null; then
        ok "$tool found"
    else
        fail "$tool not found"
        MISSING+=("$tool")
    fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    echo "Missing tools: ${MISSING[*]}. Install them and re-run."
    exit 1
fi

# ============================================================
# AWS CREDENTIALS
# ============================================================
phase "Credentials" "AWS Learner Lab session credentials"

echo "Paste your AWS Learner Lab credentials (from AWS Details -> AWS CLI)."
echo "Leave blank and press Enter to keep existing env vars (if already set)."
echo ""

read -rp "AWS_ACCESS_KEY_ID     (current: ${AWS_ACCESS_KEY_ID:-not set}): " input_key
read -rp "AWS_SECRET_ACCESS_KEY (current: [hidden]): " input_secret
read -rp "AWS_SESSION_TOKEN     (current: [hidden]): " input_token

[[ -n "$input_key" ]]    && export AWS_ACCESS_KEY_ID="$(echo "$input_key" | xargs)"
[[ -n "$input_secret" ]] && export AWS_SECRET_ACCESS_KEY="$(echo "$input_secret" | xargs)"
[[ -n "$input_token" ]]  && export AWS_SESSION_TOKEN="$(echo "$input_token" | xargs)"
export AWS_DEFAULT_REGION="$REGION"

# Validate credentials
run_checked "Validating AWS credentials..." aws sts get-caller-identity
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ok "Authenticated. Account ID: $ACCOUNT_ID"

# Set Terraform secret
export TF_VAR_root_admin_password="Scrooge@Bank2026!"

# Compute ECR values
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
declare -A ECR_REPOS=(
    [user]="${REGISTRY}/${NAME_PREFIX}-user"
    [client]="${REGISTRY}/${NAME_PREFIX}-client"
    [transaction]="${REGISTRY}/${NAME_PREFIX}-transaction"
)

# ============================================================
# PHASE 1 - BUILD BACKEND IMAGES
# ============================================================
if [[ "$SKIP_BUILD" == "false" ]]; then
    phase "Phase 1" "Build JARs + Docker images (local, no AWS needed)"

    for svc in "${SERVICES[@]}"; do
        svc_dir="$ROOT/services/backend/$svc"
        tag="${IMAGE_TAGS[$svc]}"
        repo="${ECR_REPOS[$svc]}"

        run_checked "Build JAR: $svc" bash -c "cd '$svc_dir' && ./gradlew build -x test"
        run_checked "Build Docker image: ${repo}:${tag}" docker build --provenance=false --platform linux/amd64 -t "${repo}:${tag}" "$svc_dir"
        BUILT_SERVICES+=("$svc")
    done

    ok "All ${#BUILT_SERVICES[@]} backend images built and stored in local Docker."
else
    echo "Skipping build (--skip-build flag)."
fi

# ============================================================
# PHASE 2 - INFRASTRUCTURE (Terraform)
# ============================================================
if [[ "$SKIP_INFRA" == "false" ]]; then
    phase "Phase 2" "Infrastructure provisioning (Terraform)"

    # --- 2a: Create remote state backend (idempotent) ---
    BUCKET_NAME="scroogebank-crm-lab-tfstate-${ACCOUNT_ID}"

    ensure_state_bucket() {
        if ! aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
            aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
            aws s3api put-bucket-versioning --bucket "$BUCKET_NAME" --versioning-configuration Status=Enabled
            ok "S3 bucket created: $BUCKET_NAME"
        else
            ok "S3 bucket already exists: $BUCKET_NAME"
        fi
    }

    ensure_lock_table() {
        if ! aws dynamodb describe-table --table-name scroogebank-crm-lab-tflock --region "$REGION" &>/dev/null; then
            aws dynamodb create-table \
                --table-name scroogebank-crm-lab-tflock \
                --attribute-definitions AttributeName=LockID,AttributeType=S \
                --key-schema AttributeName=LockID,KeyType=HASH \
                --billing-mode PAY_PER_REQUEST \
                --region "$REGION"
            aws dynamodb wait table-exists --table-name scroogebank-crm-lab-tflock --region "$REGION"
            ok "DynamoDB table created."
        else
            ok "DynamoDB table already exists."
        fi
    }

    run_checked "Creating S3 state bucket: $BUCKET_NAME (idempotent)..." ensure_state_bucket
    run_checked "Creating DynamoDB lock table: scroogebank-crm-lab-tflock (idempotent)..." ensure_lock_table

    # --- 2b: Terraform init / plan / apply ---
    pushd "$TF_DIR" > /dev/null

    run_checked "terraform init" terraform init \
        -backend-config "env/lab.backend.hcl" \
        -backend-config "bucket=$BUCKET_NAME" \
        -reconfigure

    run_checked "terraform plan" terraform plan \
        -var-file="env/lab.tfvars" \
        -out="lab.tfplan"

    terraform show -no-color lab.tfplan > plan.txt
    echo "Plan saved to platform/terraform/plan.txt"

    pause_for_approval "Review the plan above. Ready to apply? (This takes 15-25 minutes)"

    run_checked "terraform apply" terraform apply "lab.tfplan"

    terraform output -json > lab-outputs.json
    ok "Terraform outputs saved to lab-outputs.json"

    popd > /dev/null
else
    echo "Skipping infrastructure (--skip-infra flag)."
fi

# ============================================================
# PHASE 3 - PUSH IMAGES TO ECR + DEPLOY SERVICES
# ============================================================
if [[ ${#BUILT_SERVICES[@]} -gt 0 ]]; then
    phase "Phase 3" "Push images to ECR + deploy services"

    # ECR login
    step "Docker login to ECR"
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
    ok "Docker login to ECR"

    # Push only the images that were built
    for svc in "${BUILT_SERVICES[@]}"; do
        tag="${IMAGE_TAGS[$svc]}"
        repo="${ECR_REPOS[$svc]}"
        run_checked "Push image: ${repo}:${tag}" docker push "${repo}:${tag}"
    done

    # Detect CodeDeploy availability from terraform outputs
    CODEDEPLOY_APP=""
    pushd "$TF_DIR" > /dev/null
    CODEDEPLOY_APP=$(terraform output -raw codedeploy_ecs_application_name 2>/dev/null || true)
    popd > /dev/null
    if [[ "$CODEDEPLOY_APP" == "null" || -z "$CODEDEPLOY_APP" ]]; then
        CODEDEPLOY_APP=""
    fi

    if [[ -n "$CODEDEPLOY_APP" ]]; then
        ok "CodeDeploy detected: $CODEDEPLOY_APP (blue/green deployments)"
    else
        ok "CodeDeploy not available (ECS rolling updates)"
    fi

    # Deploy each service: register new task definition, then trigger
    # either a CodeDeploy blue/green deployment or an ECS rolling update.
    for svc in "${BUILT_SERVICES[@]}"; do
        ecs_service="${NAME_PREFIX}-${svc}"
        new_image="${ECR_REPOS[$svc]}:${IMAGE_TAGS[$svc]}"

        step "Deploying $ecs_service with image $new_image"

        # --- Get current task definition ARN ---
        CURRENT_TD_ARN=$(aws ecs describe-services \
            --cluster "$ECS_CLUSTER" \
            --services "$ecs_service" \
            --region "$REGION" \
            --query "services[0].taskDefinition" \
            --output text)

        if [[ -z "$CURRENT_TD_ARN" || "$CURRENT_TD_ARN" == "None" ]]; then
            fail "No task definition found for $ecs_service"
            exit 1
        fi
        ok "Current task definition: $CURRENT_TD_ARN"

        # --- Extract task definition (strip read-only fields via JMESPath) ---
        TD_TEMP="${RUN_DIR}/td-${svc}.json"
        aws ecs describe-task-definition \
            --task-definition "$CURRENT_TD_ARN" \
            --region "$REGION" \
            --query "taskDefinition.{family:family,taskRoleArn:taskRoleArn,executionRoleArn:executionRoleArn,networkMode:networkMode,containerDefinitions:containerDefinitions,requiresCompatibilities:requiresCompatibilities,cpu:cpu,memory:memory}" \
            --output json > "$TD_TEMP"

        # --- Update container image (single container per task definition) ---
        if sed --version &>/dev/null 2>&1; then
            sed -i "s|\"image\": \"[^\"]*\"|\"image\": \"${new_image}\"|g" "$TD_TEMP"
        else
            # macOS sed requires '' after -i
            sed -i '' "s|\"image\": \"[^\"]*\"|\"image\": \"${new_image}\"|g" "$TD_TEMP"
        fi

        # --- Register new task definition revision ---
        TD_FILE_URI="file://${TD_TEMP}"
        if command -v cygpath &>/dev/null; then
            TD_FILE_URI="file://$(cygpath -m "$TD_TEMP")"
        fi

        started_at="$(date +%s)"
        NEW_TD_ARN=$(aws ecs register-task-definition \
            --cli-input-json "$TD_FILE_URI" \
            --region "$REGION" \
            --query "taskDefinition.taskDefinitionArn" \
            --output text)
        ended_at="$(date +%s)"
        elapsed=$((ended_at - started_at))

        if [[ -z "$NEW_TD_ARN" || "$NEW_TD_ARN" == "None" ]]; then
            add_step_timing "Register task definition: $svc" "FAIL" "${elapsed}"
            fail "Failed to register new task definition for $svc"
            exit 1
        fi
        add_step_timing "Register task definition: $svc" "PASS" "${elapsed}"
        ok "New task definition: $NEW_TD_ARN"
        rm -f "$TD_TEMP"

        # --- Deploy ---
        if [[ -n "$CODEDEPLOY_APP" ]]; then
            # Blue/green deployment via CodeDeploy
            DG_NAME="${NAME_PREFIX}-${svc}-ecs"

            started_at="$(date +%s)"
            DEPLOYMENT_ID=$(aws deploy create-deployment \
                --application-name "$CODEDEPLOY_APP" \
                --deployment-group-name "$DG_NAME" \
                --revision '{"revisionType":"AppSpecContent","appSpecContent":{"content":"{\"version\":0.0,\"Resources\":[{\"TargetService\":{\"Type\":\"AWS::ECS::Service\",\"Properties\":{\"TaskDefinition\":\"'"$NEW_TD_ARN"'\",\"LoadBalancerInfo\":{\"ContainerName\":\"'"$svc"'\",\"ContainerPort\":8080}}}}]}"}}' \
                --region "$REGION" \
                --query "deploymentId" \
                --output text)
            ended_at="$(date +%s)"
            elapsed=$((ended_at - started_at))

            if [[ -z "$DEPLOYMENT_ID" || "$DEPLOYMENT_ID" == "None" ]]; then
                add_step_timing "CodeDeploy create: $svc" "FAIL" "${elapsed}"
                fail "Failed to create CodeDeploy deployment for $svc"
                exit 1
            fi
            add_step_timing "CodeDeploy create: $svc" "PASS" "${elapsed}"
            ok "CodeDeploy deployment: $DEPLOYMENT_ID"

            run_checked "Wait for CodeDeploy deployment: $DEPLOYMENT_ID" aws deploy wait deployment-successful \
                --deployment-id "$DEPLOYMENT_ID" \
                --region "$REGION"
        else
            # ECS rolling update: point service at the new task definition.
            # ECS will drain old tasks and start new ones automatically.
            run_checked "Update service: $ecs_service" aws ecs update-service \
                --cluster "$ECS_CLUSTER" \
                --service "$ecs_service" \
                --task-definition "$NEW_TD_ARN" \
                --region "$REGION" \
                --output text \
                --query "service.serviceName"

            run_checked "Wait for $ecs_service to stabilize" aws ecs wait services-stable \
                --cluster "$ECS_CLUSTER" \
                --services "$ecs_service" \
                --region "$REGION"
        fi
    done
else
    echo "Skipping Phase 3 (no images were built)."
fi

# ============================================================
# PHASE 4 - FRONTEND DEPLOYMENT
# ============================================================
if [[ "$SKIP_FRONTEND" == "false" ]]; then
    phase "Phase 4" "Frontend build + S3 upload"

    pushd "$TF_DIR" > /dev/null
    ALB=$(terraform output -raw alb_dns_name)
    BUCKET=$(terraform output -raw frontend_bucket_name)
    popd > /dev/null

    # Create .env.production
    printf "VITE_API_BASE_URL=http://%s" "$ALB" > "$FRONTEND_DIR/.env.production"
    ok ".env.production -> VITE_API_BASE_URL=http://$ALB"

    pushd "$FRONTEND_DIR" > /dev/null
    run_checked "npm install" npm install
    run_checked "npm run build" npm run build
    run_checked "S3 sync frontend to s3://$BUCKET/" aws s3 sync dist/ "s3://$BUCKET/" --delete
    popd > /dev/null
else
    echo "Skipping frontend (--skip-frontend flag)."
fi

# ============================================================
# PHASE 5 - VERIFICATION
# ============================================================
phase "Phase 5" "Verification"

pushd "$TF_DIR" > /dev/null
ALB=$(terraform output -raw alb_dns_name)
FRONTEND_URL=$(terraform output -raw frontend_website_url)
popd > /dev/null

# ECS service status
run_checked "Checking ECS service status..." aws ecs describe-services \
    --cluster "$ECS_CLUSTER" \
    --services "${SERVICES[@]/#/${NAME_PREFIX}-}" \
    --region "$REGION" \
    --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,status:status}" \
    --output table

# Health checks
run_checked "Waiting 30 seconds for ECS tasks to stabilize..." sleep 30

HEALTH_ENDPOINTS=( "/api/user/health" "/api/clients/health" "/api/transactions/health" )

for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
    url="http://${ALB}${endpoint}"
    started_at="$(date +%s)"
    step "Health check: $url"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1 || true)
    ended_at="$(date +%s)"
    elapsed=$((ended_at - started_at))
    if [[ "$http_code" == "200" ]]; then
        ok "$endpoint -> 200 OK"
        add_step_timing "Health check: $url" "PASS" "${elapsed}"
    else
        fail "$endpoint -> HTTP $http_code (ECS tasks may still be starting - check again in a few minutes)"
        ALL_HEALTHY=false
        add_step_timing "Health check: $url" "FAIL" "${elapsed}"
    fi
done

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "======================================================================"
echo "  DEPLOYMENT COMPLETE"
echo "======================================================================"
echo ""
echo "  ALB endpoint:    http://$ALB"
echo "  Frontend URL:    $FRONTEND_URL"
echo "  Logs directory:  $RUN_DIR"
echo ""
echo "  Login credentials:"
echo "    Email:    admin@crm.local"
echo "    Password: Scrooge@Bank2026!"
echo ""

if [[ "$ALL_HEALTHY" == "false" ]]; then
    echo "  NOTE: Some health checks failed. ECS tasks may still be starting."
    echo "  Re-check in 2-3 minutes with:"
    echo "    curl \"http://$ALB/api/user/health\""
    echo "    curl \"http://$ALB/api/clients/health\""
    echo "    curl \"http://$ALB/api/transactions/health\""
fi

echo ""
echo "  To re-deploy code changes later, use flags to skip phases:"
echo "    ./scripts/deploy-learnerlab.sh --skip-infra              # rebuild + push + frontend"
echo "    ./scripts/deploy-learnerlab.sh --skip-build --skip-infra # frontend only"
echo "    ./scripts/deploy-learnerlab.sh --skip-build              # infra change only"
echo ""
