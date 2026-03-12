#--------------------------------------------------------------
# CS301 Group 2 Team 3 Project - Terraform Outputs
#
# Exports key resource identifiers and endpoints for use in
# CI/CD pipelines, application configuration, and external DNS setup.
#--------------------------------------------------------------

#--------------------------------------------------------------
# Network Outputs
#--------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID."
  value       = module.network.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs."
  value       = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs."
  value       = module.network.private_subnet_ids
}

#--------------------------------------------------------------
# Compute Outputs
#--------------------------------------------------------------
output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.ecs.ecs_cluster_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for service images."
  value       = module.ecr.repository_url
}

#--------------------------------------------------------------
# Edge and Delivery Outputs
#--------------------------------------------------------------
output "alb_dns_name" {
  description = "ALB DNS name."
  value       = module.alb.alb_dns_name
}

output "log_api_invoke_url" {
  description = "API Gateway invoke URL for log Lambda routes."
  value       = var.enable_log_lambda ? module.apigateway[0].log_api_base_url : null
}

#--------------------------------------------------------------
# Database Outputs
#--------------------------------------------------------------
output "rds_endpoint" {
  description = "RDS endpoint hostname."
  value       = module.rds.rds_endpoint
}

output "rds_port" {
  description = "RDS endpoint port."
  value       = module.rds.rds_port
}

output "database_name" {
  description = "Application database name."
  value       = module.rds.database_name
}

#--------------------------------------------------------------
# CloudFront Outputs
#--------------------------------------------------------------
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = module.cloudfront.cloudfront_distribution_id
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name."
  value       = module.cloudfront.cloudfront_distribution_domain_name
}

output "app_url" {
  description = "Primary app URL."
  value       = module.cloudfront.app_url
}

#--------------------------------------------------------------
# External DNS Outputs
# Values to create CNAME / A records in an externally-managed DNS zone
#--------------------------------------------------------------
output "external_dns_frontend_name" {
  description = "DNS name to create externally for app traffic."
  value       = var.app_domain_name != "" ? var.app_domain_name : null
}

output "external_dns_frontend_target" {
  description = "CloudFront domain to target from external DNS."
  value       = module.cloudfront.cloudfront_distribution_domain_name
}

output "external_dns_alb_origin_name" {
  description = "DNS name to create externally for CloudFront-to-ALB origin."
  value       = local.use_custom_domain ? module.acm[0].alb_origin_domain_name : null
}

output "external_dns_alb_origin_target" {
  description = "ALB DNS name to target from external DNS."
  value       = module.alb.alb_dns_name
}

output "frontend_bucket_name" {
  description = "Frontend S3 bucket name."
  value       = module.s3.frontend_bucket_name
}

output "transaction_sftp_bucket_name" {
  description = "Mocked transaction SFTP source S3 bucket name."
  value       = module.s3.transaction_sftp_bucket_name
}

#--------------------------------------------------------------
# Secrets Manager Outputs
#--------------------------------------------------------------
output "jwt_secret_arn" {
  description = "Secrets Manager ARN for JWT HMAC secret."
  value       = module.security.jwt_hmac_secret_arn
}

output "root_admin_password_secret_arn" {
  description = "Secrets Manager ARN for root admin password."
  value       = module.security.root_admin_password_secret_arn
}

output "db_username_secret_arn" {
  description = "Secrets Manager ARN for database username."
  value       = module.security.db_username_secret_arn
}

output "db_password_secret_arn" {
  description = "Secrets Manager ARN for database password."
  value       = module.security.db_password_secret_arn
}

#--------------------------------------------------------------
# Lambda Outputs
#--------------------------------------------------------------
output "log_lambda_name" {
  description = "Log service Lambda function name."
  value       = module.lambda.log_lambda_name
}

output "aml_lambda_name" {
  description = "AML Lambda function name."
  value       = module.lambda.aml_lambda_name
}

output "transaction_ingestion_lambda_name" {
  description = "Scheduled transaction ingestion Lambda function name."
  value       = module.lambda.transaction_ingestion_lambda_name
}

#--------------------------------------------------------------
# IAM Outputs
#--------------------------------------------------------------
output "ecs_task_role_arns" {
  description = "Per-service ECS task role ARNs."
  value       = module.security.ecs_task_role_arns
}

output "terraform_backend_policy_arn" {
  description = "IAM policy ARN for Terraform backend access (when enabled)."
  value       = module.security.terraform_backend_policy_arn
}

#--------------------------------------------------------------
# Network: Database Subnets
#--------------------------------------------------------------
output "db_subnet_ids" {
  description = "Database subnet IDs (dedicated or private fallback)."
  value       = local.db_subnet_ids
}

#--------------------------------------------------------------
# Cognito Outputs
#--------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID."
  value       = var.enable_cognito ? module.cognito[0].user_pool_id : null
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID."
  value       = var.enable_cognito ? module.cognito[0].app_client_id : null
}

output "cognito_user_pool_endpoint" {
  description = "Cognito User Pool endpoint."
  value       = var.enable_cognito ? module.cognito[0].user_pool_endpoint : null
}

#--------------------------------------------------------------
# Messaging Outputs (SQS / SNS)
#--------------------------------------------------------------
output "audit_queue_url" {
  description = "Audit SQS queue URL."
  value       = module.sqs.audit_queue_url
}

output "aml_queue_url" {
  description = "AML SQS queue URL."
  value       = module.sqs.aml_queue_url
}

output "verification_topic_arn" {
  description = "Verification SNS topic ARN."
  value       = module.sns.verification_topic_arn
}

#--------------------------------------------------------------
# SES Outputs
#--------------------------------------------------------------
output "ses_domain_identity_arn" {
  description = "SES domain identity ARN."
  value       = module.ses.domain_identity_arn
}

output "ses_domain_verification_token" {
  description = "TXT record value for SES domain verification. Create: _amazonses.{domain} TXT {token}"
  value       = module.ses.domain_verification_token
}

output "ses_dkim_tokens" {
  description = "DKIM CNAME tokens. Create 3 CNAMEs: {token}._domainkey.{domain} -> {token}.dkim.amazonses.com"
  value       = module.ses.dkim_tokens
}

output "ses_mail_from_domain" {
  description = "Custom MAIL FROM domain. Create MX + SPF TXT records (see docs)."
  value       = module.ses.mail_from_domain
}

#--------------------------------------------------------------
# DynamoDB Outputs
#--------------------------------------------------------------
output "audit_logs_table_name" {
  description = "Audit logs DynamoDB table name."
  value       = module.dynamodb.audit_logs_table_name
}

output "aml_reports_table_name" {
  description = "AML reports DynamoDB table name."
  value       = module.dynamodb.aml_reports_table_name
}

# --- Pipeline Lambdas ---

output "audit_consumer_lambda_name" {
  description = "Audit consumer Lambda function name."
  value       = module.lambda.audit_consumer_lambda_name
}

output "aml_consumer_lambda_name" {
  description = "AML consumer Lambda function name."
  value       = module.lambda.aml_consumer_lambda_name
}

output "verification_lambda_name" {
  description = "Verification Lambda function name."
  value       = module.lambda.verification_lambda_name
}

# --- Observability ---

output "cloudtrail_arn" {
  description = "CloudTrail ARN."
  value       = module.observability.cloudtrail_arn
}

# --- Backup ---

output "backup_vault_arn" {
  description = "AWS Backup vault ARN."
  value       = module.backup.backup_vault_arn
}
