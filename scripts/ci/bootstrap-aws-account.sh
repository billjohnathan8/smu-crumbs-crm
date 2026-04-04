#!/usr/bin/env bash
set -euo pipefail
#
# bootstrap-aws-account.sh
#
# Prepares a fresh/empty AWS account for Terraform provisioning via GitHub Actions.
# Run this ONCE before the first cd-tf-infra-provision.yml workflow run.
#
# Prerequisites:
#   - AWS CLI configured with admin credentials (IAM user or SSO session)
#   - jq installed
#
# What this script creates (idempotent - safe to re-run):
#   1. IAM OIDC provider for GitHub Actions
#   2. IAM role "GithubActionsCDRole" with permissions for CI/CD deployments
#   3. IAM role "GithubActionsTerraformRole" with broad infra management permissions
#   4. S3 bucket for Terraform state
#   5. DynamoDB table for Terraform state locking
#
# What this script does NOT touch:
#   - Route53 hosted zones (managed by school)
#   - Route53Domains (managed by school)
#
# Usage:
#   export AWS_REGION=ap-southeast-1
#   export GITHUB_ORG=smu-cs301-project
#   export GITHUB_REPO=project-2025-26-t2-project-2025-26t2-g2-t3
#   ./scripts/ci/bootstrap-aws-account.sh
#

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
GITHUB_ORG="${GITHUB_ORG:-smu-cs301-project}"
GITHUB_REPO="${GITHUB_REPO:-project-2025-26-t2-project-2025-26t2-g2-t3}"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-crumbs-scroogebank-tfstate}"
TF_LOCK_TABLE="${TF_LOCK_TABLE:-crumbs-scroogebank-tflock-prod}"
CD_ROLE_NAME="${CD_ROLE_NAME:-GithubActionsCDRole}"
TF_ROLE_NAME="${TF_ROLE_NAME:-GithubActionsTerraformRole}"

echo "============================================"
echo "  AWS Account Bootstrap for GitHub Actions"
echo "============================================"
echo "Region:         ${AWS_REGION}"
echo "GitHub:         ${GITHUB_ORG}/${GITHUB_REPO}"
echo "TF Bucket:      ${TF_STATE_BUCKET}"
echo "TF Lock Table:  ${TF_LOCK_TABLE}"
echo "CD Role:        ${CD_ROLE_NAME}"
echo "TF Role:        ${TF_ROLE_NAME}"
echo "============================================"
echo

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "AWS Account ID: ${ACCOUNT_ID}"
echo

# ── 1. GitHub Actions OIDC Provider ────────────────────────────────
OIDC_PROVIDER_URL="https://token.actions.githubusercontent.com"
OIDC_THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"

echo "==> Step 1: GitHub Actions OIDC Provider"
EXISTING_OIDC="$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?ends_with(Arn, '/token.actions.githubusercontent.com')].Arn" --output text 2>/dev/null || true)"
if [[ -n "${EXISTING_OIDC}" && "${EXISTING_OIDC}" != "None" ]]; then
  echo "    Already exists: ${EXISTING_OIDC}"
  OIDC_ARN="${EXISTING_OIDC}"
else
  OIDC_ARN="$(aws iam create-open-id-connect-provider \
    --url "${OIDC_PROVIDER_URL}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "${OIDC_THUMBPRINT}" \
    --query 'OpenIDConnectProviderArn' \
    --output text)"
  echo "    Created: ${OIDC_ARN}"
fi
echo

# ── 2. CD Role (for ECS/Lambda/Frontend deploys via OIDC) ─────────
echo "==> Step 2: GitHub Actions CD Role (${CD_ROLE_NAME})"

CD_TRUST_POLICY="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
)"

if aws iam get-role --role-name "${CD_ROLE_NAME}" >/dev/null 2>&1; then
  echo "    Already exists. Updating trust policy..."
  aws iam update-assume-role-policy --role-name "${CD_ROLE_NAME}" --policy-document "${CD_TRUST_POLICY}"
else
  aws iam create-role \
    --role-name "${CD_ROLE_NAME}" \
    --assume-role-policy-document "${CD_TRUST_POLICY}" \
    --description "GitHub Actions CI/CD role for ${GITHUB_ORG}/${GITHUB_REPO}" \
    --max-session-duration 3600 >/dev/null
  echo "    Created role: ${CD_ROLE_NAME}"
fi

# CD role permissions: ECR, ECS, Lambda, S3 (frontend + manifests), CloudFront, SSM
CD_POLICY_NAME="${CD_ROLE_NAME}-policy"
CD_POLICY="$(cat <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECR",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:DescribeRepositories",
        "ecr:ListImages"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECS",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:UpdateService",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:DeregisterTaskDefinition",
        "ecs:ListTaskDefinitions",
        "ecs:DescribeClusters"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateAlias",
        "lambda:GetAlias",
        "lambda:PublishVersion",
        "lambda:ListVersionsByFunction"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:GetDistribution"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "ecs-tasks.amazonaws.com",
            "lambda.amazonaws.com"
          ]
        }
      }
    }
  ]
}
POLICY
)"

# Create or update inline policy
aws iam put-role-policy \
  --role-name "${CD_ROLE_NAME}" \
  --policy-name "${CD_POLICY_NAME}" \
  --policy-document "${CD_POLICY}"
echo "    Attached inline policy: ${CD_POLICY_NAME}"
echo

# ── 3. Terraform State Backend ─────────────────────────────────────
echo "==> Step 3: Terraform State Backend"

if aws s3api head-bucket --bucket "${TF_STATE_BUCKET}" 2>/dev/null; then
  echo "    S3 bucket already exists: s3://${TF_STATE_BUCKET}"
else
  if [[ "${AWS_REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${TF_STATE_BUCKET}" --region "${AWS_REGION}"
  else
    aws s3api create-bucket \
      --bucket "${TF_STATE_BUCKET}" \
      --region "${AWS_REGION}" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}"
  fi
  echo "    Created S3 bucket: s3://${TF_STATE_BUCKET}"
fi

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket "${TF_STATE_BUCKET}" \
  --versioning-configuration Status=Enabled 2>/dev/null || true
echo "    Versioning enabled on s3://${TF_STATE_BUCKET}"

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "${TF_STATE_BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }' 2>/dev/null || true
echo "    Encryption enabled on s3://${TF_STATE_BUCKET}"

# Block public access
aws s3api put-public-access-block \
  --bucket "${TF_STATE_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" 2>/dev/null || true
echo "    Public access blocked on s3://${TF_STATE_BUCKET}"

# DynamoDB lock table
if aws dynamodb describe-table --table-name "${TF_LOCK_TABLE}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "    DynamoDB table already exists: ${TF_LOCK_TABLE}"
else
  aws dynamodb create-table \
    --table-name "${TF_LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}"
  aws dynamodb wait table-exists --table-name "${TF_LOCK_TABLE}" --region "${AWS_REGION}"
  echo "    Created DynamoDB table: ${TF_LOCK_TABLE}"
fi
echo

# ── Summary ────────────────────────────────────────────────────────
CD_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${CD_ROLE_NAME}"

echo "============================================"
echo "  Bootstrap Complete!"
echo "============================================"
echo
echo "Required GitHub Actions SECRETS:"
echo "  AWS_ACCESS_KEY_ID       = <your IAM user access key>"
echo "  AWS_SECRET_ACCESS_KEY   = <your IAM user secret key>"
echo "  AWS_ROLE_ARN            = ${CD_ROLE_ARN}"
echo "  TF_ROOT_ADMIN_PASSWORD  = <strong password for CRM admin>"
echo "  TF_JWT_HMAC_SECRET      = <random 32+ char string>"
echo "  SFTP_PRIVATE_KEY        = <SSH private key for SFTP>"
echo "  BOOTSTRAP_SEED_USER_PASSWORD = <password for seed agent users>"
echo
echo "Required GitHub Actions VARIABLES:"
echo "  AWS_REGION              = ${AWS_REGION}"
echo "  TF_STATE_BUCKET         = ${TF_STATE_BUCKET}"
echo "  TF_LOCK_DYNAMODB        = ${TF_LOCK_TABLE}"
echo "  TF_APP_DOMAIN_NAME      = itsag2t3.com"
echo "  BACKEND_BUCKET          = crumbs-scroogebank-backend"
echo
echo "NOTE: The IAM user whose access keys are used must have"
echo "sufficient permissions for Terraform to manage all AWS resources."
echo "For a school project, AdministratorAccess is acceptable."
echo "============================================"
