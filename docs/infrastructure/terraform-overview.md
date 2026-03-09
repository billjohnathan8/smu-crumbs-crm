# Implementation Context Summary

> Generated: 2026-03-09
> Scope: `platform/terraform/` — static code analysis only

---

## 1. Repository Structure

The Terraform codebase lives under `platform/terraform/` and follows a **flat root + module decomposition** pattern:

```
platform/terraform/
├── main.tf              # Module orchestration
├── variables.tf         # All root-level inputs
├── locals.tf            # Computed values
├── outputs.tf           # Exported values
├── providers.tf         # AWS provider config
└── modules/
    ├── network/         # VPC, subnets, IGW, NAT, route tables, flow logs
    ├── security/        # Security groups, IAM roles, Secrets Manager
    ├── ecr/             # Container registry
    ├── rds/             # PostgreSQL RDS + KMS
    ├── acm/             # Certificate resolution (data-only)
    ├── alb/             # Application Load Balancer + Route53
    ├── lambda/          # All Lambda functions (log, AML, audit consumer, AML consumer, verification)
    ├── apigateway/      # HTTP API for log service
    ├── ecs/             # ECS cluster, services, autoscaling, CloudMap
    ├── s3/              # Frontend + verification buckets
    ├── waf/             # WAFv2 Web ACL
    ├── cloudfront/      # CDN distribution + Route53
    ├── cognito/         # User pool (feature-gated)
    ├── sqs/             # Audit + AML queues (feature-gated)
    ├── sns/             # Verification topic (feature-gated)
    ├── ses/             # Email identity + domain verification
    ├── dynamodb/        # Audit logs + AML reports tables (feature-gated)
    ├── observability/   # CloudTrail + CloudWatch alarms (feature-gated)
    └── backup/          # AWS Backup vault + plans
```

There is **one** root Terraform configuration. There are no environment-specific directories (`envs/dev/`, `envs/prod/`). Environment differentiation is handled through **variables** (`var.environment`) and **tfvars files** passed at plan/apply time.

---

## 2. Module Design Philosophy

- **Single-purpose modules**: Each module encapsulates one AWS service domain.
- **Root orchestration**: `main.tf` is the sole entry point; all inter-module wiring happens there.
- **Feature flags**: Several capabilities are gated behind boolean variables with `count` or conditional expressions. This allows incremental rollout.
- **Naming convention**: `${name_prefix}-<resource-label>` where `name_prefix = lower("${project_name}-${environment}")`.

---

## 3. Naming Conventions

| Pattern | Example |
|---------|---------|
| Name prefix | `scroogebank-crm-dev` |
| VPC | `scroogebank-crm-dev-vpc` |
| Subnets | `scroogebank-crm-dev-public-1`, `-private-1`, `-db-1` |
| ECS cluster | `scroogebank-crm-dev-ecs` |
| ECS services | `scroogebank-crm-dev-agent`, `-client`, `-transaction` |
| Lambda | `scroogebank-crm-dev-log-service`, `-aml`, `-audit-consumer`, `-aml-consumer`, `-verification` |
| Secrets | `/{project_name}/{environment}/jwt/hmac_secret`, `/db/password`, etc. |
| SSM parameters | `/{project_name}/{environment}/db/host`, `/service/client/internal_url`, etc. |

---

## 4. Environment Abstractions & Parameterization

The codebase uses a **single workspace / single root** model. Environment-specific values are injected via:

- `var.environment` (default: `"dev"`)
- `var.project_name` (default: `"scroogebank-crm"`)
- Feature toggle variables (`enable_cognito`, `enable_audit_pipeline`, etc.)
- Terraform `-var-file` or `-var` flags at runtime

All resource names incorporate `local.name_prefix` for environment isolation.

---

## 5. Compute Architecture: ECS Fargate

The diagram shows three backend services (User, Client, Transaction) with auto scaling groups. The repository implements this using **ECS Fargate** instead of EC2 ASGs:

- **Three ECS services**: `agent` (≈ User/Agent service), `client`, `transaction`
- **Fargate launch type** with `assign_public_ip = false` (private subnet placement)
- **Application Auto Scaling** with CPU and memory target-tracking policies per service
- **ALB integration** via path-based routing rules per service
- **Service discovery** via AWS Cloud Map private DNS namespace
- Container images pulled from ECR (`${ecr_repository_url}:${image_tag}`)

> **Note on naming**: The diagram labels one service "User service"; the codebase names it `agent`. This is a naming difference, not an architectural gap. The service handles auth/agent endpoints (`/api/auth*`, `/api/agents*`).

---

## 6. Database Architecture

- **Single `aws_db_instance`** (PostgreSQL) with `multi_az` variable (default `false`)
- Supports dedicated DB subnets (`var.db_subnet_cidrs`) or falls back to private subnets
- `publicly_accessible = false` — explicitly private
- Storage encrypted with customer-managed KMS key
- DB subnet group created from provided subnet IDs
- Backup retention configurable (default 7 days)

The diagram expects primary/secondary RDS across two AZs. Multi-AZ is **parameterized but disabled by default**.

---

## 7. Ingestion Flow (SFTP/AML)

The diagram shows: SFTP → EventBridge (1hr) → SFTP Lambda → DB.

The repository implements:
- `aws_lambda_function.aml` — fetches from external SFTP and calls the CRM API
- `aws_cloudwatch_event_rule.aml_schedule` — EventBridge scheduled rule (configurable, default: monthly cron)
- SFTP connection details via environment variables + Secrets Manager
- Lambda calls `CRM_API_BASE_URL` (ALB) to load data to RDS via the backend services

This is a functionally equivalent flow. The Lambda does not write directly to RDS but routes through the API layer.

---

## 8. Audit Logging Flow

The diagram shows: App services → SQS → Log Lambda → LogDB.

The repository implements:
- `aws_sqs_queue.audit` — audit queue (gated by `enable_audit_pipeline`)
- `aws_lambda_function.audit_consumer` — reads from SQS, writes to DynamoDB
- `aws_lambda_event_source_mapping.audit_sqs` — wires SQS to Lambda
- `aws_dynamodb_table.audit_logs` — audit log datastore
- ECS task roles have `sqs:SendMessage` IAM policy to audit queue
- This is **distinct from CloudWatch/CloudTrail** — it is a dedicated business audit pipeline

---

## 9. AML Flow

The diagram shows: Transaction service → SQS → AML Lambda → AMLReportDB.

The repository has **two AML-related Lambda paths**:
1. **AML ingestion Lambda** (`aws_lambda_function.aml`) — SFTP fetch + EventBridge schedule (always created)
2. **AML consumer Lambda** (`aws_lambda_function.aml_consumer`) — SQS → DynamoDB (gated by `enable_aml_pipeline`)

The SQS → Lambda → DynamoDB consumer path matches the diagram's AML asynchronous flow.

---

## 10. Verification/Document Flow

The diagram shows: SES → Verification Lambda → SNS → Document Verification storage.

The repository implements:
- `aws_lambda_function.verification` — triggered by S3 object creation events
- SES integration via `SES_SENDER_EMAIL` environment variable
- SNS publishing via `SNS_TOPIC_ARN` environment variable + IAM policy
- S3 verification bucket for document storage
- S3 → Lambda trigger configured in `aws_s3_bucket_notification.verification`

The flow direction differs slightly from diagram (S3 triggers Lambda, Lambda uses SES/SNS), but the architectural components and wiring are present.

---

## 11. Edge/Delivery Path

- **Route 53**: Records for CloudFront and ALB (when custom domain + hosted zone ID provided)
- **CloudFront**: Distribution with 3 origins (S3 frontend, ALB backend, API Gateway log API)
- **WAF**: WAFv2 Web ACL associated with CloudFront (in us-east-1)
- **ALB**: Internet-facing, in public subnets, with path-based routing to 3 ECS services
- **S3**: Frontend static asset bucket with OAC for CloudFront access

---

## 12. Security Controls

- **IAM**: Extensive role/policy structure for ECS execution, ECS tasks (per-service), Lambda functions, backup, VPC flow logs
- **Secrets Manager**: JWT HMAC, root admin password, DB username, DB password (all with auto-generation)
- **ACM**: Certificate ARNs passed as variables (not created in-repo — likely managed externally or pre-provisioned)
- **WAF**: WAFv2 with AWS Managed Rules (Common + SQLi)
- **Security Groups**: Layered (ALB → ECS → DB, Lambda → DB)

---

## 13. Observability

- **CloudWatch Log Groups**: For ECS services, Lambda functions, API Gateway, VPC flow logs
- **CloudWatch Alarms**: CPU/memory for ECS, CPU/storage for RDS, 5XX for ALB (gated by `enable_cloudwatch_alarms`)
- **CloudTrail**: Single-region trail with S3 bucket (gated by `enable_cloudtrail`)
- **ECS Container Insights**: Enabled on the ECS cluster

---

## 14. Resilience & Discovery

- **AWS Backup**: Vault + daily plan covering RDS + DynamoDB (enabled by default)
- **CloudMap**: Private DNS namespace for service-to-service discovery

---

## 15. Key Design Decisions

1. **ECS Fargate over EC2 ASGs**: Equivalent scalable compute; matches diagram intent
2. **Feature flags for pipelines**: Audit, AML consumer, verification, Cognito, CloudTrail, alarms all default to `false` — present in code but not active by default
3. **Single ECR repository**: All services share one repo with tagged images
4. **API Gateway for log service**: Log Lambda is fronted by HTTP API Gateway, not ALB — this adds a separate origin in CloudFront
5. **ACM certificates are external**: ARNs are passed in as variables, not created/validated in Terraform
6. **Route53 hosted zone is external**: Zone ID is passed in; zone itself is not managed
