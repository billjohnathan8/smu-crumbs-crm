# Environment Configuration Contract

This document is the source of truth for feature enablement across project environments.

## Canonical Terraform Env Profiles

- `platform/terraform/env/local.tfvars` (local contract for LocalStack/fullstack parity)
- `platform/terraform/env/integration.tfvars` (shared integration AWS contract)
- `platform/terraform/env/lab.tfvars` (Learner Lab contract)
- `platform/terraform/env/prod.tfvars` (production-like AWS contract)

## `enable_*` Feature Flag Matrix

| Terraform flag | local | integration | learner-lab | production-like |
|---|---:|---:|---:|---:|
| `enable_stateful_service_scale_out` | `false` | `false` | `false` | `false` |
| `enable_ecs_container_insights` | `false` | `false` | `false` | `false` |
| `enable_log_lambda` | `true` | `true` | `false` | `true` |
| `enable_aml_lambda` | `false` | `false` | `false` | `false` |
| `enable_transaction_ingestion_lambda` | `true` | `true` | `false` | `true` |
| `enable_waf` | `false` | `false` | `false` | `false` |
| `enable_cloudfront` | `false` | `true` | `false` | `true` |
| `enable_cloudfront_oac` | `false` | `true` | `false` | `true` |
| `enable_service_discovery` | `false` | `true` | `false` | `true` |
| `enable_vpc_flow_logs` | `false` | `false` | `false` | `false` |
| `enable_multi_az_nat` | `false` | `false` | `false` | `false` |
| `enable_nat_gateway` | `false` | `false` | `false` | `false` |
| `enable_cognito` | `false` | `true` | `false` | `true` |
| `enable_audit_pipeline` | `false` | `false` | `false` | `false` |
| `enable_aml_pipeline` | `false` | `false` | `false` | `false` |
| `enable_verification_pipeline` | `true` | `true` | `false` | `true` |
| `enable_cloudtrail` | `false` | `false` | `false` | `false` |
| `enable_cloudwatch_alarms` | `false` | `false` | `false` | `false` |
| `enable_backup` | `false` | `false` | `false` | `false` |

## Major Requirement Feature Status

| Feature | Current repo state | local | integration | learner-lab | production-like | Notes |
|---|---|---|---|---|---|---|
| Log Lambda + API Gateway | implemented | enabled | enabled | disabled | enabled | Required by verification feedback path. |
| Verification pipeline (SES/SNS/Lambda/S3) | implemented | enabled | enabled | disabled | enabled | Learner-lab keeps this off due SES ownership + LabRole constraints. |
| Transaction ingestion Lambda | implemented | enabled | enabled | disabled | enabled | Uses transaction S3 import path. |
| Service discovery (Cloud Map) | implemented | out of scope | enabled | disabled | enabled | Local uses Docker DNS; learner-lab cannot create Cloud Map namespace. |
| AML Lambda (scheduled SFTP pull) | implemented but disabled | disabled | disabled | disabled | disabled | Requires external SFTP endpoint/key contract not represented in repo defaults. |
| Audit pipeline (SQS + consumer + DynamoDB) | partial | disabled | disabled | disabled | disabled | `audit-consumer` runtime artifact missing (`services/backend/audit-consumer/...`). |
| AML async pipeline (SQS + consumer + DynamoDB) | partial | disabled | disabled | disabled | disabled | `aml-consumer` runtime artifact missing (`services/backend/aml-consumer/...`). |

## Learner-Lab Coverage Limits

Learner-lab intentionally does **not** provide full requirement coverage for runtime feature paths:

- Lambdas/pipelines remain disabled to keep deployment reliable under LabRole restrictions and budget limits.
- `enable_service_discovery=false` because LabRole cannot create Cloud Map namespaces.
- Verification/ingestion/feedback acceptance is covered in local/integration smoke flows instead.

## Smoke/Integration Contract

- Reusable fullstack integration CI now runs with `VERIFICATION_EMAIL_PROVIDER=ses` (LocalStack SES), so verification feedback assertions are part of standard integration checks.
- `scripts/ci/run-ingestion-verification-smoke.sh` also forces `VERIFICATION_EMAIL_PROVIDER=ses` to match the enabled local/integration contract.
