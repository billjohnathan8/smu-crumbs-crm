# Terraform Inventory and Terraform-vs-AWS Reconciliation (Production)

Generated: 2026-04-05
Account: 699089610166
Primary region: ap-southeast-1

## Scope and evidence

This inventory reconciles Terraform state with direct AWS production observations.

Evidence used:

- Terraform state addresses: `build-logs/infra-audit-20260405/terraform-state-list.txt`
- Refresh-only drift detection: `build-logs/infra-audit-20260405/terraform-refresh-only-plan.txt`
- Direct AWS runtime/resource summary: `build-logs/infra-audit-20260405/direct-findings.json`
- Additional AWS inventory snapshot: `aws/inventory/aws-inventory-20260405-095224/*`

## 1) Terraform managed inventory (from state)

Total Terraform state addresses: 337

Module distribution:

| Module | Resource addresses |
|---|---:|
| security | 94 |
| observability | 30 |
| apigateway | 29 |
| lambda | 28 |
| ecs | 24 |
| network | 23 |
| s3 | 17 |
| ses | 12 |
| alb | 11 |
| sftp_server | 10 |
| rds | 9 |
| acm | 9 |
| sns | 8 |
| cloudfront | 7 |
| backup | 7 |
| ecr | 6 |
| cognito | 5 |
| sqs | 4 |
| dynamodb | 2 |
| root | 2 |
| other modules combined | 10 |

## 2) Live production inventory snapshot (direct AWS)

Core footprint observed:

- ECS: 1 cluster, 3 services (`user`, `client`, `transaction`), each desired=1 and running=1
- ALB: 1 internet-facing ALB, 3 target groups, healthy targets
- Lambda: 6 functions
- API Gateway HTTP API: 1 API, 21 routes
- CloudFront: 1 distribution, alias `itsag2t3.com`, 3 origins
- RDS: PostgreSQL, class `db.t4g.small`, Multi-AZ enabled
- Networking: VPC `10.42.0.0/16`, 4 subnets, 2 NAT gateways, 1 IGW
- S3 buckets (prod-relevant): backend, frontend, sftp, verification, tfstate, cloudtrail
- DynamoDB tables: Terraform lock table plus AML/audit data tables
- Messaging: 4 SQS queues, 2 SNS topics
- Security/observability: GuardDuty enabled, 35 CloudWatch alarms

## 3) Drift detected by Terraform refresh-only plan

Detected out-of-band drift (refresh-only):

- `module.cloudfront[0].aws_cloudfront_distribution.frontend` changed
- ECS service task definition revisions changed for all three services
- ECS task definition resources show tag drift updates
- Lambda package/version drift across all six lambda functions (code hash, version, last modified)
- `module.rds.aws_db_instance.postgres` changed on `latest_restorable_time` (expected mutable attribute)
- SNS topic policy drift on alarms topic
- Security SNS topic policy drift for GuardDuty publishing
- SFTP security group ingress rule deleted:
  - `module.sftp_server.aws_security_group_rule.sftp_ec2_ingress_from_security_groups["0"]`

## 4) Reconciliation assessment

### In sync (high confidence)

- Core architecture exists as Terraform intends: VPC, ALB, ECS services, Lambda functions, API Gateway, CloudFront, RDS, SQS/SNS/DynamoDB, Cognito, SES, Backup, GuardDuty.

### Drift or mutable-state differences

- Frequent deploy-driven drifts in ECS/Lambda revisions are present.
- Policy-level drift exists on SNS alarm topic policies.
- At least one network-security drift exists (SFTP SG ingress rule removed from managed expectation).

### Unmanaged or extra-account artifacts observed

- Default VPC also exists in account (outside this stack design).
- Multiple Elastic IP allocations are present; one attached to SFTP EC2 and others not directly attributable from this production stack snapshot.
- ManagedBy=terraform tag count (189) is lower than total state addresses (337), indicating mixed tagging coverage or non-taggable resources.

## 5) Risk prioritization

Highest-risk reconciliation items:

1. Deleted SFTP ingress security-group rule (possible access/control regression or intentional hardening; verify intent).
2. SNS topic policy drift on alarms topic (can affect EventBridge/CloudWatch publish behavior and incident delivery).
3. Repeated out-of-band Lambda and ECS revision updates (can obscure source of truth and complicate rollbacks/audits).

## 6) Recommended remediation workflow

1. Classify drift into expected runtime mutation vs unauthorized/manual changes.
2. For expected changes, run controlled Terraform apply to re-baseline state.
3. For unapproved changes, revert in code and apply from Terraform-only path.
4. Add drift detection as scheduled CI check with alerting on policy and security-group classes.
5. Tighten deployment pipeline so ECS/Lambda updates are consistently represented in Terraform workflow artifacts.
