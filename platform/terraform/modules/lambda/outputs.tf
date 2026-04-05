#--------------------------------------------------------------
# Lambda Module - Outputs
#--------------------------------------------------------------

output "log_lambda_name" {
  description = "Log lambda function name."
  value       = local.log_function_name
}

output "log_lambda_invoke_arn" {
  description = "Log lambda invoke ARN."
  value       = local.log_function_invoke_arn
}

output "aml_lambda_name" {
  description = "AML lambda function name."
  value       = local.aml_function_name
}

output "sftp_transaction_collector_name" {
  description = "Transaction ingestion Lambda function name."
  value       = local.sftp_transaction_collector_function_name
}

output "audit_consumer_lambda_name" {
  description = "Audit consumer Lambda function name."
  value       = local.audit_consumer_function_name
}

output "aml_consumer_lambda_name" {
  description = "AML consumer Lambda function name."
  value       = local.aml_consumer_function_name
}

output "verification_lambda_name" {
  description = "Verification Lambda function name."
  value       = local.verification_function_name
}

output "log_lambda_alias_name" {
  description = "Deployment alias name for log Lambda."
  value       = var.enable_log_lambda ? aws_lambda_alias.log_live[0].name : ""
}

output "aml_lambda_alias_name" {
  description = "Deployment alias name for AML Lambda."
  value       = var.enable_aml_lambda ? aws_lambda_alias.aml_live[0].name : ""
}

output "sftp_transaction_collector_alias_name" {
  description = "Deployment alias name for sftp-transaction-collector Lambda."
  value       = var.enable_sftp_transaction_collector ? aws_lambda_alias.sftp_transaction_collector_live[0].name : ""
}

output "verification_lambda_alias_name" {
  description = "Deployment alias name for verification Lambda."
  value       = var.enable_verification_lambda ? aws_lambda_alias.verification_live[0].name : ""
}
