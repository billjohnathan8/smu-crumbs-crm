#--------------------------------------------------------------
# Security Module - Outputs
#--------------------------------------------------------------

output "alb_security_group_id" {
  description = "ALB security group ID."
  value       = aws_security_group.alb.id
}

output "ecs_service_security_group_id" {
  description = "ECS service security group ID."
  value       = aws_security_group.ecs_service.id
}

output "lambda_security_group_id" {
  description = "Lambda security group ID."
  value       = aws_security_group.lambda.id
}

output "db_security_group_id" {
  description = "Database security group ID."
  value       = aws_security_group.db.id
}

output "jwt_hmac_secret_arn" {
  description = "JWT HMAC secret ARN."
  value       = aws_secretsmanager_secret.jwt_hmac.arn
}

output "root_admin_password_secret_arn" {
  description = "Root admin password secret ARN."
  value       = aws_secretsmanager_secret.root_admin_password.arn
}

output "db_username_secret_arn" {
  description = "DB username secret ARN."
  value       = aws_secretsmanager_secret.db_username.arn
}

output "db_password_secret_arn" {
  description = "DB password secret ARN."
  value       = aws_secretsmanager_secret.db_password.arn
}

output "db_password_value" {
  description = "Generated DB password value."
  value       = local.db_password_value
  sensitive   = true
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN."
  value       = local.use_lab_role ? var.lab_role_arn : aws_iam_role.ecs_task_execution[0].arn
}

output "ecs_task_role_arns" {
  description = "Per-service ECS task role ARNs."
  value = local.use_lab_role ? {
    user       = var.lab_role_arn
    client      = var.lab_role_arn
    transaction = var.lab_role_arn
  } : { for service, role in aws_iam_role.ecs_task : service => role.arn }
}

output "log_lambda_role_arn" {
  description = "Log Lambda IAM role ARN."
  value       = local.use_lab_role ? var.lab_role_arn : aws_iam_role.log_lambda[0].arn
}

output "aml_lambda_role_arn" {
  description = "AML Lambda IAM role ARN."
  value       = local.use_lab_role ? var.lab_role_arn : aws_iam_role.aml_lambda[0].arn
}

output "terraform_backend_policy_arn" {
  description = "IAM policy ARN for Terraform backend access."
  value       = var.create_backend_iam_policy ? aws_iam_policy.terraform_backend_access[0].arn : null
}

output "audit_consumer_lambda_role_arn" {
  description = "Audit consumer Lambda IAM role ARN."
  value       = var.enable_audit_pipeline ? aws_iam_role.audit_consumer_lambda[0].arn : null
}

output "aml_consumer_lambda_role_arn" {
  description = "AML consumer Lambda IAM role ARN."
  value       = var.enable_aml_pipeline ? aws_iam_role.aml_consumer_lambda[0].arn : null
}

output "verification_lambda_role_arn" {
  description = "Verification Lambda IAM role ARN."
  value       = var.enable_verification_pipeline ? aws_iam_role.verification_lambda[0].arn : null
}

output "transaction_ingestion_lambda_role_arn" {
  description = "Transaction ingestion Lambda IAM role ARN."
  value       = var.enable_transaction_ingestion_lambda ? aws_iam_role.transaction_ingestion_lambda[0].arn : null
}
