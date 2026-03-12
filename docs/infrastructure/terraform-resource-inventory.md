# Terraform Resource Inventory

> Generated: 2026-03-09
> Source: `platform/terraform/` (static code analysis only — no state or deployed infrastructure)

---

## Root Configuration

| File | Purpose |
|------|---------|
| `main.tf` | Orchestrates all modules, wires inputs/outputs |
| `variables.tf` | Root-level variable declarations with defaults |
| `locals.tf` | Computed values: name_prefix, common_tags, bucket names, subnet selection |
| `outputs.tf` | Exposes key outputs (VPC, ALB, RDS, ECS, CloudFront, Secrets, etc.) |
| `providers.tf` | AWS provider (ap-southeast-1) + us-east-1 alias for CloudFront/WAF |

---

## Module Inventory

| Module | Source Path | Invoked From |
|--------|-------------|--------------|
| `network` | `./modules/network` | `main.tf` |
| `security` | `./modules/security` | `main.tf` |
| `ecr` | `./modules/ecr` | `main.tf` |
| `rds` | `./modules/rds` | `main.tf` |
| `acm` | `./modules/acm` | `main.tf` |
| `alb` | `./modules/alb` | `main.tf` |
| `lambda` | `./modules/lambda` | `main.tf` |
| `apigateway` | `./modules/apigateway` | `main.tf` |
| `ecs` | `./modules/ecs` | `main.tf` |
| `s3` | `./modules/s3` | `main.tf` |
| `waf` | `./modules/waf` | `main.tf` |
| `cloudfront` | `./modules/cloudfront` | `main.tf` |
| `cognito` | `./modules/cognito` | `main.tf` (count = `enable_cognito`) |
| `sqs` | `./modules/sqs` | `main.tf` |
| `sns` | `./modules/sns` | `main.tf` |
| `ses` | `./modules/ses` | `main.tf` |
| `dynamodb` | `./modules/dynamodb` | `main.tf` |
| `observability` | `./modules/observability` | `main.tf` |
| `backup` | `./modules/backup` | `main.tf` |

---

## AWS Resource Inventory by Module

### module.network

| Resource | Type | File |
|----------|------|------|
| `aws_vpc.this` | `aws_vpc` | `vpc.tf` |
| `aws_internet_gateway.this` | `aws_internet_gateway` | `vpc.tf` |
| `aws_eip.nat[*]` | `aws_eip` | `vpc.tf` |
| `aws_nat_gateway.this[*]` | `aws_nat_gateway` | `vpc.tf` |
| `aws_subnet.public[*]` | `aws_subnet` | `subnets.tf` |
| `aws_subnet.private[*]` | `aws_subnet` | `subnets.tf` |
| `aws_subnet.db[*]` | `aws_subnet` | `subnets.tf` |
| `aws_route_table.public` | `aws_route_table` | `route_tables.tf` |
| `aws_route_table.private[0]` | `aws_route_table` | `route_tables.tf` (single-NAT mode) |
| `aws_route_table.private_per_az[*]` | `aws_route_table` | `route_tables.tf` (multi-AZ NAT mode) |
| `aws_route_table.db[0]` | `aws_route_table` | `route_tables.tf` (when db_subnet_cidrs provided) |
| `aws_route_table_association.public[*]` | `aws_route_table_association` | `route_tables.tf` |
| `aws_route_table_association.private[*]` | `aws_route_table_association` | `route_tables.tf` |
| `aws_route_table_association.db[*]` | `aws_route_table_association` | `route_tables.tf` |
| `aws_cloudwatch_log_group.vpc_flow_logs[0]` | `aws_cloudwatch_log_group` | `vpc_flow_logs.tf` |
| `aws_iam_role.vpc_flow_logs[0]` | `aws_iam_role` | `vpc_flow_logs.tf` |
| `aws_iam_role_policy.vpc_flow_logs[0]` | `aws_iam_role_policy` | `vpc_flow_logs.tf` |
| `aws_flow_log.this[0]` | `aws_flow_log` | `vpc_flow_logs.tf` |

### module.security

| Resource | Type | File |
|----------|------|------|
| `aws_security_group.alb` | `aws_security_group` | `main.tf` |
| `aws_security_group.ecs_service` | `aws_security_group` | `main.tf` |
| `aws_security_group.lambda` | `aws_security_group` | `main.tf` |
| `aws_security_group.db` | `aws_security_group` | `main.tf` |
| `aws_iam_role.ecs_task_execution` | `aws_iam_role` | `main.tf` |
| `aws_iam_role_policy_attachment.ecs_task_execution_managed` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_iam_role_policy.ecs_task_execution_extra` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role.ecs_task["agent"|"client"|"transaction"]` | `aws_iam_role` | `main.tf` |
| `aws_iam_role.log_lambda` | `aws_iam_role` | `main.tf` |
| `aws_iam_role_policy_attachment.log_lambda_basic` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_iam_role_policy_attachment.log_lambda_vpc` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_iam_role_policy.log_lambda_secrets` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role.aml_lambda` | `aws_iam_role` | `main.tf` |
| `aws_iam_role_policy_attachment.aml_lambda_basic` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_iam_role_policy.aml_lambda_secrets` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role.audit_consumer_lambda[0]` | `aws_iam_role` | `main.tf` (when enable_audit_pipeline) |
| `aws_iam_role_policy.audit_consumer_lambda[0]` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role.aml_consumer_lambda[0]` | `aws_iam_role` | `main.tf` (when enable_aml_pipeline) |
| `aws_iam_role_policy.aml_consumer_lambda[0]` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role.verification_lambda[0]` | `aws_iam_role` | `main.tf` (when enable_verification_pipeline) |
| `aws_iam_role_policy.verification_lambda[0]` | `aws_iam_role_policy` | `main.tf` |
| `aws_iam_role_policy.ecs_task_sqs["agent"|"client"|"transaction"]` | `aws_iam_role_policy` | `main.tf` (when audit or AML pipeline enabled) |
| `aws_iam_policy.terraform_backend_access[0]` | `aws_iam_policy` | `main.tf` (when create_backend_iam_policy) |
| `random_password.jwt_hmac_secret` | `random_password` | `secrets.tf` |
| `random_password.root_admin_password` | `random_password` | `secrets.tf` |
| `random_password.db_password` | `random_password` | `secrets.tf` |
| `aws_secretsmanager_secret.jwt_hmac` | `aws_secretsmanager_secret` | `secrets.tf` |
| `aws_secretsmanager_secret_version.jwt_hmac` | `aws_secretsmanager_secret_version` | `secrets.tf` |
| `aws_secretsmanager_secret.root_admin_password` | `aws_secretsmanager_secret` | `secrets.tf` |
| `aws_secretsmanager_secret_version.root_admin_password` | `aws_secretsmanager_secret_version` | `secrets.tf` |
| `aws_secretsmanager_secret.db_username` | `aws_secretsmanager_secret` | `secrets.tf` |
| `aws_secretsmanager_secret_version.db_username` | `aws_secretsmanager_secret_version` | `secrets.tf` |
| `aws_secretsmanager_secret.db_password` | `aws_secretsmanager_secret` | `secrets.tf` |
| `aws_secretsmanager_secret_version.db_password` | `aws_secretsmanager_secret_version` | `secrets.tf` |

### module.ecr

| Resource | Type | File |
|----------|------|------|
| `aws_ecr_repository.app` | `aws_ecr_repository` | `main.tf` |
| `aws_ecr_lifecycle_policy.app` | `aws_ecr_lifecycle_policy` | `main.tf` |

### module.rds

| Resource | Type | File |
|----------|------|------|
| `aws_db_subnet_group.postgres` | `aws_db_subnet_group` | `main.tf` |
| `aws_db_instance.postgres` | `aws_db_instance` | `main.tf` |
| `aws_ssm_parameter.db_host` | `aws_ssm_parameter` | `main.tf` |
| `aws_ssm_parameter.db_port` | `aws_ssm_parameter` | `main.tf` |
| `aws_ssm_parameter.db_name` | `aws_ssm_parameter` | `main.tf` |
| `aws_ssm_parameter.client_db_url` | `aws_ssm_parameter` | `main.tf` |
| `aws_kms_key.rds` | `aws_kms_key` | `kms.tf` |
| `aws_kms_alias.rds` | `aws_kms_alias` | `kms.tf` |

### module.acm

| Resource | Type | File |
|----------|------|------|
| *(data-only / locals-only module)* | — | `main.tf` |

### module.alb

| Resource | Type | File |
|----------|------|------|
| `aws_lb.crm` | `aws_lb` | `main.tf` |
| `aws_lb_target_group.service["agent"|"client"|"transaction"]` | `aws_lb_target_group` | `main.tf` |
| `aws_lb_listener.http` | `aws_lb_listener` | `main.tf` |
| `aws_lb_listener.https[0]` | `aws_lb_listener` | `main.tf` (when custom domain) |
| `aws_lb_listener_rule.options_preflight` | `aws_lb_listener_rule` | `main.tf` |
| `aws_lb_listener_rule.client_transactions` | `aws_lb_listener_rule` | `main.tf` |
| `aws_lb_listener_rule.service["agent"|"client"|"transaction"]` | `aws_lb_listener_rule` | `main.tf` |
| `aws_route53_record.alb[0]` | `aws_route53_record` | `route53.tf` (when custom domain + zone_id) |

ALB route precedence (lower priority number evaluated first):

| Priority | Path Pattern | Target Service | Why |
|----------|--------------|----------------|-----|
| `1` | `OPTIONS` method | Fixed `200` response | CORS preflight handling |
| `10` | `/api/auth*`, `/api/agents*`, `/api/v1/agents*`, `/api/v1/health` | `agent` | Agent/auth APIs |
| `15` | `/api/clients/*/transactions*` | `transaction` | Contract path `/api/clients/{clientId}/transactions` belongs to transaction API and must override generic client routing |
| `20` | `/api/clients*`, `/api/accounts*`, `/api/v1/clients*` | `client` | Client/account APIs |
| `30` | `/api/transactions*` | `transaction` | Transaction APIs |

### module.lambda

| Resource | Type | File |
|----------|------|------|
| `aws_cloudwatch_log_group.log_lambda` | `aws_cloudwatch_log_group` | `main.tf` |
| `aws_lambda_function.log` | `aws_lambda_function` | `main.tf` |
| `aws_cloudwatch_log_group.aml_lambda` | `aws_cloudwatch_log_group` | `main.tf` |
| `aws_lambda_function.aml` | `aws_lambda_function` | `main.tf` |
| `aws_cloudwatch_event_rule.aml_schedule` | `aws_cloudwatch_event_rule` | `main.tf` |
| `aws_cloudwatch_event_target.aml_lambda` | `aws_cloudwatch_event_target` | `main.tf` |
| `aws_lambda_permission.allow_eventbridge_invoke_aml` | `aws_lambda_permission` | `main.tf` |
| `aws_cloudwatch_log_group.audit_consumer[0]` | `aws_cloudwatch_log_group` | `main.tf` (when enable_audit_consumer) |
| `aws_lambda_function.audit_consumer[0]` | `aws_lambda_function` | `main.tf` |
| `aws_lambda_event_source_mapping.audit_sqs[0]` | `aws_lambda_event_source_mapping` | `main.tf` |
| `aws_cloudwatch_log_group.aml_consumer[0]` | `aws_cloudwatch_log_group` | `main.tf` (when enable_aml_consumer) |
| `aws_lambda_function.aml_consumer[0]` | `aws_lambda_function` | `main.tf` |
| `aws_lambda_event_source_mapping.aml_sqs[0]` | `aws_lambda_event_source_mapping` | `main.tf` |
| `aws_cloudwatch_log_group.verification[0]` | `aws_cloudwatch_log_group` | `main.tf` (when enable_verification_lambda) |
| `aws_lambda_function.verification[0]` | `aws_lambda_function` | `main.tf` |
| `aws_lambda_permission.allow_s3_invoke_verification[0]` | `aws_lambda_permission` | `main.tf` |
| `aws_s3_bucket_notification.verification[0]` | `aws_s3_bucket_notification` | `main.tf` |

### module.apigateway

| Resource | Type | File |
|----------|------|------|
| `aws_apigatewayv2_api.log` | `aws_apigatewayv2_api` | `main.tf` |
| `aws_apigatewayv2_integration.log_lambda` | `aws_apigatewayv2_integration` | `main.tf` |
| `aws_apigatewayv2_route.log[*]` | `aws_apigatewayv2_route` | `main.tf` |
| `aws_cloudwatch_log_group.api_gateway` | `aws_cloudwatch_log_group` | `main.tf` |
| `aws_apigatewayv2_stage.log_default` | `aws_apigatewayv2_stage` | `main.tf` |
| `aws_lambda_permission.allow_api_gateway_invoke_log` | `aws_lambda_permission` | `main.tf` |
| `aws_ssm_parameter.log_service_url` | `aws_ssm_parameter` | `main.tf` |

### module.ecs

| Resource | Type | File |
|----------|------|------|
| `aws_ecs_cluster.this` | `aws_ecs_cluster` | `main.tf` |
| `aws_ecs_task_definition.service["agent"|"client"|"transaction"]` | `aws_ecs_task_definition` | `ecs.tf` |
| `aws_ecs_service.service["agent"|"client"|"transaction"]` | `aws_ecs_service` | `ecs.tf` |
| `aws_ssm_parameter.client_service_url` | `aws_ssm_parameter` | `ecs.tf` |
| `aws_appautoscaling_target.service["agent"|"client"|"transaction"]` | `aws_appautoscaling_target` | `auto_scaling.tf` |
| `aws_appautoscaling_policy.cpu["agent"|"client"|"transaction"]` | `aws_appautoscaling_policy` | `auto_scaling.tf` |
| `aws_appautoscaling_policy.memory["agent"|"client"|"transaction"]` | `aws_appautoscaling_policy` | `auto_scaling.tf` |
| `aws_service_discovery_private_dns_namespace.internal` | `aws_service_discovery_private_dns_namespace` | `service_discovery.tf` |
| `aws_service_discovery_service.service["agent"|"client"|"transaction"]` | `aws_service_discovery_service` | `service_discovery.tf` |
| `aws_cloudwatch_log_group.ecs["agent"|"client"|"transaction"]` | `aws_cloudwatch_log_group` | `logs.tf` |

### module.s3

| Resource | Type | File |
|----------|------|------|
| `aws_s3_bucket.frontend` | `aws_s3_bucket` | `main.tf` |
| `aws_s3_bucket_versioning.frontend` | `aws_s3_bucket_versioning` | `main.tf` |
| `aws_s3_bucket_server_side_encryption_configuration.frontend` | configured | `main.tf` |
| `aws_s3_bucket_public_access_block.frontend` | `aws_s3_bucket_public_access_block` | `main.tf` |
| `aws_s3_bucket_ownership_controls.frontend` | `aws_s3_bucket_ownership_controls` | `main.tf` |
| `aws_s3_bucket.verification[0]` | `aws_s3_bucket` | `main.tf` (when enable_verification_bucket) |
| `aws_s3_bucket_versioning.verification[0]` | `aws_s3_bucket_versioning` | `main.tf` |
| `aws_s3_bucket_server_side_encryption_configuration.verification[0]` | configured | `main.tf` |
| `aws_s3_bucket_public_access_block.verification[0]` | `aws_s3_bucket_public_access_block` | `main.tf` |

### module.waf

| Resource | Type | File |
|----------|------|------|
| `aws_wafv2_web_acl.frontend[0]` | `aws_wafv2_web_acl` | `main.tf` (when enable_waf) |

### module.cloudfront

| Resource | Type | File |
|----------|------|------|
| `aws_cloudfront_origin_access_control.frontend` | `aws_cloudfront_origin_access_control` | `main.tf` |
| `aws_cloudfront_distribution.frontend` | `aws_cloudfront_distribution` | `main.tf` |
| `aws_s3_bucket_policy.frontend` | `aws_s3_bucket_policy` | `main.tf` |
| `aws_route53_record.cloudfront[0]` | `aws_route53_record` | `route53.tf` (when custom domain + zone_id) |

### module.cognito (count-gated: `enable_cognito`)

| Resource | Type | File |
|----------|------|------|
| `aws_cognito_user_pool.this` | `aws_cognito_user_pool` | `main.tf` |
| `aws_cognito_user_pool_client.this` | `aws_cognito_user_pool_client` | `main.tf` |
| `aws_cognito_user_pool_domain.this[0]` | `aws_cognito_user_pool_domain` | `main.tf` (when cognito_domain_prefix set) |

### module.sqs

| Resource | Type | File |
|----------|------|------|
| `aws_sqs_queue.audit_dlq[0]` | `aws_sqs_queue` | `main.tf` (when enable_audit_pipeline) |
| `aws_sqs_queue.audit[0]` | `aws_sqs_queue` | `main.tf` (when enable_audit_pipeline) |
| `aws_sqs_queue.aml_dlq[0]` | `aws_sqs_queue` | `main.tf` (when enable_aml_pipeline) |
| `aws_sqs_queue.aml[0]` | `aws_sqs_queue` | `main.tf` (when enable_aml_pipeline) |

### module.sns

| Resource | Type | File |
|----------|------|------|
| `aws_sns_topic.verification[0]` | `aws_sns_topic` | `main.tf` (when enable_verification_pipeline) |
| `aws_sns_topic_subscription.verification_email[0]` | `aws_sns_topic_subscription` | `main.tf` (when enable + email set) |

### module.ses

| Resource | Type | File |
|----------|------|------|
| `aws_ses_email_identity.verification[0]` | `aws_ses_email_identity` | `main.tf` (when no domain) |
| `aws_ses_domain_identity.this[0]` | `aws_ses_domain_identity` | `main.tf` (when domain set) |
| `aws_ses_domain_dkim.this[0]` | `aws_ses_domain_dkim` | `main.tf` |
| `aws_ses_domain_mail_from.this[0]` | `aws_ses_domain_mail_from` | `main.tf` |

### module.dynamodb

| Resource | Type | File |
|----------|------|------|
| `aws_dynamodb_table.audit_logs[0]` | `aws_dynamodb_table` | `main.tf` (when enable_audit_table) |
| `aws_dynamodb_table.aml_reports[0]` | `aws_dynamodb_table` | `main.tf` (when enable_aml_table) |

### module.observability

| Resource | Type | File |
|----------|------|------|
| `aws_s3_bucket.cloudtrail[0]` | `aws_s3_bucket` | `main.tf` (when enable_cloudtrail) |
| `aws_s3_bucket_policy.cloudtrail[0]` | `aws_s3_bucket_policy` | `main.tf` |
| `aws_s3_bucket_server_side_encryption_configuration.cloudtrail[0]` | configured | `main.tf` |
| `aws_s3_bucket_public_access_block.cloudtrail[0]` | `aws_s3_bucket_public_access_block` | `main.tf` |
| `aws_cloudtrail.this[0]` | `aws_cloudtrail` | `main.tf` (when enable_cloudtrail) |
| `aws_cloudwatch_metric_alarm.ecs_cpu_high["agent"|"client"|"transaction"]` | `aws_cloudwatch_metric_alarm` | `main.tf` (when enable_ecs_alarms) |
| `aws_cloudwatch_metric_alarm.rds_cpu_high[0]` | `aws_cloudwatch_metric_alarm` | `main.tf` (when enable_rds_alarms) |
| `aws_cloudwatch_metric_alarm.rds_free_storage[0]` | `aws_cloudwatch_metric_alarm` | `main.tf` |
| `aws_cloudwatch_metric_alarm.alb_5xx[0]` | `aws_cloudwatch_metric_alarm` | `main.tf` (when enable_alb_alarms) |

### module.backup

| Resource | Type | File |
|----------|------|------|
| `aws_backup_vault.this[0]` | `aws_backup_vault` | `main.tf` (when enable_backup) |
| `aws_backup_plan.this[0]` | `aws_backup_plan` | `main.tf` |
| `aws_iam_role.backup[0]` | `aws_iam_role` | `main.tf` |
| `aws_iam_role_policy_attachment.backup[0]` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_iam_role_policy_attachment.backup_restore[0]` | `aws_iam_role_policy_attachment` | `main.tf` |
| `aws_backup_selection.rds[0]` | `aws_backup_selection` | `main.tf` |
| `aws_backup_selection.dynamodb[0]` | `aws_backup_selection` | `main.tf` |

---

## Feature-Gated Resources Summary

Several pipelines are gated behind boolean variables (default `false`):

| Variable | Default | Controls |
|----------|---------|----------|
| `enable_cognito` | `false` | Cognito User Pool, Client, Domain |
| `enable_audit_pipeline` | `false` | Audit SQS queues, consumer Lambda, DynamoDB table, IAM roles |
| `enable_aml_pipeline` | `false` | AML SQS queues, consumer Lambda, DynamoDB table, IAM roles |
| `enable_verification_pipeline` | `false` | Verification Lambda, SNS topic, S3 bucket, IAM roles |
| `enable_cloudtrail` | `false` | CloudTrail trail + S3 bucket |
| `enable_cloudwatch_alarms` | `false` | CloudWatch metric alarms for ECS, RDS, ALB |
| `enable_waf` | `true` | WAFv2 Web ACL for CloudFront |
| `enable_backup` | `true` | AWS Backup vault, plan, selections |
| `enable_vpc_flow_logs` | `true` | VPC Flow Logs |
| `db_multi_az` | `false` | RDS Multi-AZ deployment |

---

## Resources Always Created (unconditional)

- VPC, IGW, NAT Gateway, public/private subnets, route tables
- ALB + 3 target groups + listener rules (including `/api/clients/*/transactions*` -> transaction-service precedence override)
- ECS cluster, 3 task definitions, 3 services, 3 autoscaling targets + policies
- CloudMap namespace + 3 service discovery services
- ECR repository
- RDS PostgreSQL instance + DB subnet group + KMS key
- S3 frontend bucket
- CloudFront distribution (with S3 + ALB + API Gateway origins)
- API Gateway HTTP API for log Lambda
- Log Lambda + AML Lambda + EventBridge schedule
- Secrets Manager secrets (JWT, admin password, DB username, DB password)
- Security groups (ALB, ECS, Lambda, DB)
- IAM roles (ECS execution, ECS task x3, log Lambda, AML Lambda)
- SES (always `enable_ses = true` in root `main.tf`)
