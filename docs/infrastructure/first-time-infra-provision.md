# First-Time AWS Infrastructure Provisioning

**Scope:** Full end-to-end AWS Learner Lab deployment of ScroogeBank CRM
**Terraform working directory:** `platform/terraform/`
**Shell:** PowerShell
**AWS Region:** `us-east-1` (Learner Lab default)

> **PowerShell rule:** Never use backtick `` ` `` line continuation — it silently appends hidden characters and causes "Too many command line arguments" errors. All commands in this guide are single lines.

---

## Overview

The deployment has **5 phases**, all of which must succeed for the app to work:

| Phase | What | Time |
|-------|------|------|
| 1. Build images | Build JARs and Docker images locally (no AWS needed) | ~10 min |
| 2. Infrastructure | Terraform creates VPC, RDS, ECS, ALB, ECR, S3, Cognito | ~15-25 min |
| 3. Push images | Authenticate to ECR, push pre-built images | ~2 min |
| 4. Frontend | Build React app, upload to S3 | ~2 min |
| 5. Verification | Health checks, login test | ~2 min |

> **Why build first?** Image builds (JARs + Docker) are independent of AWS. Building before Terraform means you catch build failures fast — before waiting 15-25 minutes for infrastructure. Only the `docker push` requires ECR to exist.

---

## Pre-flight checklist

- [ ] AWS Learner Lab session is **started** and credentials panel is open
- [ ] AWS CLI installed (`aws --version`)
- [ ] Terraform >= 1.10.0 installed (`terraform version`)
- [ ] Docker Desktop running (`docker version`)
- [ ] Java 21 SDK installed (`java -version`)
- [ ] Node.js + npm installed (`node -v && npm -v`)
- [ ] You are in a PowerShell terminal at the **repo root**

---

## Phase 1 — Build Backend Images (local, no AWS needed)

### Step 1 — Build JARs and Docker images

> **No AWS credentials required for this phase.** You only need Java 21, Docker Desktop, and the repo cloned.

> **Tip:** If you ran the local test pipeline (`scripts/test-and-spinup-all/`) before starting this guide, the JARs are already built — skip the `gradlew` steps below and go straight to `docker build`. Verify with:
> ```powershell
> Get-ChildItem services\backend\*\build\libs\*.jar | Select-Object Name, LastWriteTime
> ```
> All three JARs should have recent timestamps. If any is stale, run `gradlew build -x test` for that service only.

> **Critical:** The Dockerfiles copy pre-built JARs. You MUST build the JAR first or the Docker image will contain stale code (missing CORS fixes, etc).

```powershell
$ROOT = $PWD.Path  # run from repo root
$ECR = "231570205144.dkr.ecr.us-east-1.amazonaws.com/scroogebank-crm-lab-services"

# Agent service
cd "$ROOT\services\backend\agent"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:agent-lab-001" services\backend\agent

# Client service
cd "$ROOT\services\backend\client"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:client-lab-001" services\backend\client

# Transaction service
cd "$ROOT\services\backend\transaction"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:transaction-lab-001" services\backend\transaction
```

> **Why `--provenance=false --platform linux/amd64`:** Docker Desktop with BuildKit enabled builds images as OCI manifest lists containing both the `linux/amd64` image and an `unknown/unknown` provenance attestation manifest. ECS's containerd runtime fails to resolve the correct platform from this manifest list and reports `CannotPullContainerError: not found`. The flags produce a standard single-arch image that ECS can pull correctly.

> Image tags must match `lab.tfvars` values: `agent-lab-001`, `client-lab-001`, `transaction-lab-001`. If you use different tags, update `lab.tfvars` and re-apply.

---

## Phase 2 — Infrastructure (Terraform)

### Step 2 — Export Learner Lab session credentials

In the AWS Learner Lab console, click **AWS Details** → **AWS CLI** → copy the three lines. Translate to PowerShell:

```powershell
$env:AWS_ACCESS_KEY_ID     = "ASIA..."
$env:AWS_SECRET_ACCESS_KEY = "..."
$env:AWS_SESSION_TOKEN     = "..."
$env:AWS_DEFAULT_REGION    = "us-east-1"
```

Verify:

```powershell
aws sts get-caller-identity
```

Expected: JSON with your Account ID. If you get `ExpiredToken`, restart the Learner Lab session and re-export.

> **Note:** These variables only live for the current PowerShell session. If you close the terminal, re-export everything.

---

### Step 3 — Export Terraform secret variables

```powershell
$env:TF_VAR_root_admin_password = "YourPasswordHere!"
```

- This seeds the root admin account password in the database. **Remember this value** — you need it to log in.
- If you forget it later, retrieve from Secrets Manager: `aws secretsmanager get-secret-value --secret-id "/scroogebank-crm/lab/agent/root_admin_password" --query SecretString --output text`
- `TF_VAR_jwt_hmac_secret` is auto-generated if unset (recommended for lab).

---

### Step 4 — Create remote state backend (one-time)

> **This step only needs to be done once.** If the S3 bucket and DynamoDB table already exist, skip to Step 5.

> **Easiest path:** Do both in the AWS Console.

**S3 bucket:**
1. S3 → Create bucket → name: `scroogebank-crm-lab-tfstate`, region: `us-east-1`
2. Enable Versioning
3. Enable SSE-S3 (AES-256) encryption
4. Keep "Block all public access" ON

**DynamoDB table:**
1. DynamoDB → Create table → name: `scroogebank-crm-lab-tflock`
2. Partition key: `LockID` (String)
3. Default settings (on-demand capacity)

CLI alternative:

```powershell
aws s3api create-bucket --bucket scroogebank-crm-lab-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket scroogebank-crm-lab-tfstate --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name scroogebank-crm-lab-tflock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region us-east-1
aws dynamodb wait table-exists --table-name scroogebank-crm-lab-tflock --region us-east-1
```

> Do NOT add `--create-bucket-configuration` for us-east-1 — it causes `InvalidLocationConstraint`.

---

### Step 5 — Terraform init / plan / apply

```powershell
cd platform/terraform
terraform init -backend-config "env/lab.backend.hcl" -reconfigure
terraform plan -var-file="env/lab.tfvars" -out="lab.tfplan"
terraform show -no-color lab.tfplan > plan.txt
terraform apply "lab.tfplan"
```

Apply takes **15-25 minutes**. Longest resources: RDS (~10 min), NAT Gateway (~2 min).

> CloudFront is **disabled** in lab (`enable_cloudfront = false`). This is expected — frontend uses S3 static website hosting instead.

Save outputs:

```powershell
terraform output -json | Out-File lab-outputs.json -Encoding utf8
```

Key outputs to note:

| Output | Description |
|--------|-------------|
| `alb_dns_name` | Backend API endpoint (ALB) |
| `ecr_repository_url` | Where to push Docker images |
| `frontend_bucket_name` | S3 bucket for frontend assets |
| `frontend_website_url` | S3 website hosting URL (app URL) |
| `ecs_cluster_name` | ECS cluster name (`scroogebank-crm-lab-ecs`) |
| `cognito_user_pool_id` | Cognito pool for auth |

---

## Phase 3 — Push Images to ECR

> Images are already built (Phase 1). ECR now exists (Terraform created it in Phase 2).

### Step 6 — Authenticate Docker to ECR

```powershell
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 231570205144.dkr.ecr.us-east-1.amazonaws.com"
```

> **Why `cmd /c`:** PowerShell's object pipeline adds `\r\n` to the ECR token before passing it to Docker, which corrupts the Authorization header and causes a `400 Bad Request` from ECR. Using `cmd /c` routes through cmd.exe's byte pipe, which passes the token unmodified.

### Step 7 — Push images to ECR

```powershell
$ECR = "231570205144.dkr.ecr.us-east-1.amazonaws.com/scroogebank-crm-lab-services"

docker push "${ECR}:agent-lab-001"
docker push "${ECR}:client-lab-001"
docker push "${ECR}:transaction-lab-001"
```

### Step 8 — Force ECS redeployment

After the initial push, force ECS to pick up the new images:

```powershell
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-agent --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-client --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-transaction --force-new-deployment --region us-east-1
```

---

## Phase 4 — Frontend Deployment

### Step 9 — Create `.env.production`

Get the ALB DNS name:

```powershell
cd platform/terraform
terraform output -raw alb_dns_name
```

Create `services/frontend/crm-ui/.env.production` with the ALB URL:

```powershell
$ALB = terraform output -raw alb_dns_name
"VITE_API_BASE_URL=http://$ALB" | Out-File -FilePath "services\frontend\crm-ui\.env.production" -Encoding utf8 -NoNewline
```

> **Why this is needed:** Without CloudFront, the frontend (S3) and backend (ALB) are on different domains. `VITE_API_BASE_URL` tells the React app to send API calls to the ALB instead of relative paths (which would hit S3 and return 405).

### Step 10 — Build and upload frontend

```powershell
cd services\frontend\crm-ui
npm install
npm run build
$BUCKET = cd $ROOT\platform\terraform; terraform output -raw frontend_bucket_name; cd $ROOT\services\frontend\crm-ui
aws s3 sync dist/ "s3://$BUCKET/" --delete
```

Or with a known bucket name:

```powershell
aws s3 sync dist/ s3://scroogebank-crm-lab-frontend-231570205144/ --delete
```

S3 static website hosting and public read policy are managed by Terraform (`frontend_bucket_allow_public = true` in `lab.tfvars`), so no manual Console steps are needed.

---

## Phase 5 — Verification

### Step 11 — Check ECS services

```powershell
aws ecs describe-services --cluster scroogebank-crm-lab-ecs --services scroogebank-crm-lab-agent scroogebank-crm-lab-client scroogebank-crm-lab-transaction --region us-east-1 --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,pending:pendingCount}"
```

Expected: `running == desired` for all three.

### Step 12 — Check ALB target health

```powershell
$arns = aws elbv2 describe-target-groups --names scroogebank-crm-lab-agent-tg scroogebank-crm-lab-client-tg scroogebank-crm-lab-transaction --region us-east-1 --query "TargetGroups[*].TargetGroupArn" --output text
```

All three should show `healthy`.

### Step 13 — Health check endpoints

Get the current ALB DNS from Terraform (it changes between deploys):

```powershell
cd platform/terraform
$ALB = terraform output -raw alb_dns_name
```

Then health-check all three services:

```powershell
curl.exe "http://$ALB/api/agent/health"
curl.exe "http://$ALB/api/clients/health"
curl.exe "http://$ALB/api/transactions/health"
```

> **Note:** The ALB DNS name changes every time you run `terraform destroy` + `terraform apply`. Always get it from `terraform output -raw alb_dns_name` — never hardcode it.

All should return HTTP 200.

### Step 14 — Login test

Get the frontend URL from Terraform:

```powershell
cd platform/terraform
terraform output -raw frontend_website_url
```

Open the URL in your browser and login with:
- **Email:** `admin@crm.local`
- **Password:** the value you set for `TF_VAR_root_admin_password`

---

## Quick Reference — Full First Deploy

```powershell
$ROOT = $PWD.Path  # run from repo root

# === CREDENTIALS (repeat after expiry) ===
$env:AWS_ACCESS_KEY_ID     = "ASIA..."
$env:AWS_SECRET_ACCESS_KEY = "..."
$env:AWS_SESSION_TOKEN     = "..."
$env:AWS_DEFAULT_REGION    = "us-east-1"
$env:TF_VAR_root_admin_password = "YourPasswordHere!"

# === PHASE 1: INFRASTRUCTURE ===
cd platform/terraform
terraform init -backend-config "env/lab.backend.hcl" -reconfigure
terraform plan -var-file="env/lab.tfvars" -out="lab.tfplan"
terraform apply "lab.tfplan"

# === PHASE 2: BACKEND IMAGES ===
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 231570205144.dkr.ecr.us-east-1.amazonaws.com"

$ECR = "231570205144.dkr.ecr.us-east-1.amazonaws.com/scroogebank-crm-lab-services"

cd "$ROOT\services\backend\agent"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:agent-lab-001" services\backend\agent
docker push "${ECR}:agent-lab-001"

cd "$ROOT\services\backend\client"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:client-lab-001" services\backend\client
docker push "${ECR}:client-lab-001"

cd "$ROOT\services\backend\transaction"; .\gradlew.bat build -x test; cd $ROOT
docker build --provenance=false --platform linux/amd64 -t "${ECR}:transaction-lab-001" services\backend\transaction
docker push "${ECR}:transaction-lab-001"

# Force ECS to pick up new images
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-agent --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-client --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-transaction --force-new-deployment --region us-east-1

# === PHASE 3: FRONTEND ===
cd platform/terraform
$ALB = terraform output -raw alb_dns_name
cd "$ROOT\services\frontend\crm-ui"
npm install
"VITE_API_BASE_URL=http://$ALB" | Out-File -FilePath ".env.production" -Encoding utf8 -NoNewline
npm run build
aws s3 sync dist/ s3://scroogebank-crm-lab-frontend-231570205144/ --delete

# === PHASE 4: VERIFY ===
cd $ROOT\platform\terraform
$ALB = terraform output -raw alb_dns_name
curl.exe "http://$ALB/api/agent/health"
curl.exe "http://$ALB/api/clients/health"
curl.exe "http://$ALB/api/transactions/health"
terraform output -raw frontend_website_url
# Open the above URL in browser. Login: admin@crm.local / <your TF_VAR_root_admin_password>
```

---

## Key Learner Lab Constraints

| Constraint | Impact | Workaround |
|------------|--------|------------|
| LabRole cannot create IAM roles | All services use pre-existing `LabRole` | `lab_role_arn` set in `lab.tfvars` |
| LabRole cannot create CloudFront | No CDN | S3 static website hosting + CORS on backends |
| LabRole cannot create Cloud Map | No service discovery | `enable_service_discovery = false`, services use ALB |
| Session credentials expire (~4 hours) | Must re-export frequently | Keep Learner Lab tab open, re-export before operations |
| `access-analyzer:ValidatePolicy` blocked | Console shows red banner on bucket policies | Ignore — policy saves correctly despite the warning |

---

## Troubleshooting

### ECR docker login returns 400 Bad Request

**Symptom:** `Error response from daemon: login attempt to https://....dkr.ecr.us-east-1.amazonaws.com/v2/ failed with status: 400 Bad Request`

**Cause:** PowerShell's object pipeline appends `\r\n` to the ECR token before passing it to Docker, corrupting the Authorization header. This happens even with valid credentials.

**Fix:** Use `cmd /c` to pipe through cmd.exe instead:
```powershell
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 231570205144.dkr.ecr.us-east-1.amazonaws.com"
```

**Verify credentials are valid first:**
```powershell
aws sts get-caller-identity
```
If that fails with `ExpiredToken`, re-export credentials first.

---

### Expired Learner Lab credentials

**Symptom:** `ExpiredTokenException` or `InvalidToken`

**Fix:** Restart the Learner Lab session, re-export all `$env:AWS_*` variables in the **same PowerShell window**.

---

### Forgot root admin password

```powershell
aws secretsmanager get-secret-value --secret-id "/scroogebank-crm/lab/agent/root_admin_password" --query SecretString --output text
```

---

### Missing TF_VAR secrets

**Symptom:** `Error: No value for required variable`

**Fix:**
```powershell
$env:TF_VAR_root_admin_password = "..."
```

---

### Missing backend resources (S3 bucket or DynamoDB table)

**Symptom during init:** `S3 bucket does not exist` or `ResourceNotFoundException`

**Fix:** Re-run Step 4. Confirm with:
```powershell
aws s3 ls s3://scroogebank-crm-lab-tfstate
aws dynamodb describe-table --table-name scroogebank-crm-lab-tflock --region us-east-1
```

---

### Lambda artifact warnings

**Symptom:** `Warning: Check block assertion failed`

**Not a blocker.** All Lambda flags are `false` in `lab.tfvars`. These are advisory only.

---

### CannotPullContainerError: not found

**Symptom:** ECS stopped task shows `stoppedReason: CannotPullContainerError: ... :agent-lab-001: not found`

**Cause:** Docker Desktop with BuildKit enabled builds images as OCI manifest lists containing both the `linux/amd64` image and an `unknown/unknown` provenance attestation manifest. ECS's containerd runtime fails to resolve the correct platform from this manifest list.

**Fix:** Rebuild and push all three images with `--provenance=false --platform linux/amd64`:

```powershell
$ECR = "231570205144.dkr.ecr.us-east-1.amazonaws.com/scroogebank-crm-lab-services"
$ROOT = $PWD.Path  # run from repo root

docker build --provenance=false --platform linux/amd64 -t "${ECR}:agent-lab-001" "$ROOT\services\backend\agent"
docker push "${ECR}:agent-lab-001"

docker build --provenance=false --platform linux/amd64 -t "${ECR}:client-lab-001" "$ROOT\services\backend\client"
docker push "${ECR}:client-lab-001"

docker build --provenance=false --platform linux/amd64 -t "${ECR}:transaction-lab-001" "$ROOT\services\backend\transaction"
docker push "${ECR}:transaction-lab-001"

aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-agent --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-client --force-new-deployment --region us-east-1
aws ecs update-service --cluster scroogebank-crm-lab-ecs --service scroogebank-crm-lab-transaction --force-new-deployment --region us-east-1
```

---

### ECS tasks not starting (running == 0)

**Diagnosis:**
```powershell
aws ecs list-tasks --cluster scroogebank-crm-lab-ecs --desired-status STOPPED --region us-east-1
aws ecs describe-tasks --cluster scroogebank-crm-lab-ecs --tasks "<TASK_ARN>" --region us-east-1 --query "tasks[0].containers[*].{name:name,reason:reason,exitCode:exitCode}"
```

Common causes:
- **ECR images not pushed** — ECS cannot pull non-existent images. Complete Phase 3.
- **RDS not ready** — tasks retry once RDS becomes `available`
- **Stale Docker images** — Dockerfiles copy pre-built JARs. If you didn't run `gradlew build` before `docker build`, the image has old code. Rebuild the JAR first.

---

### CORS errors in browser

**Symptom:** `Access-Control-Allow-Origin` missing, login fails with "Failed to fetch"

**Checklist:**
1. Verify `.env.production` exists and points to the ALB URL (not empty)
2. Verify frontend was rebuilt **after** creating `.env.production` (`npm run build`)
3. Verify frontend was re-uploaded to S3 (`aws s3 sync dist/ s3://<bucket>/ --delete`)
4. Verify backend images were built **after** the CORS SecurityConfig changes (rebuild JAR → rebuild Docker → push → redeploy)

---

### 405 Method Not Allowed on login

**Symptom:** POST returns 405

**Cause:** `.env.production` is missing or empty. API calls go to S3 (which rejects POST) instead of the ALB.

**Fix:** Create `.env.production`, rebuild frontend, re-upload to S3 (Steps 9-10).

---

### ECS cluster not found

**Note:** The cluster name is `scroogebank-crm-lab-ecs` (with `-ecs` suffix), not `scroogebank-crm-lab`.

---

### Terraform state lock stuck

**Only if no other Terraform process is running:**
```powershell
terraform force-unlock "<lock-id>"
```

---

### S3 bucket policy validator error (Console)

If the Console shows a red banner about `access-analyzer:ValidatePolicy` when saving a bucket policy, ignore it — LabRole blocks that API. Click **Save changes** anyway; it will succeed.
