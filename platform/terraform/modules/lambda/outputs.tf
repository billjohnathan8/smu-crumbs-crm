#--------------------------------------------------------------
# Lambda Module - Outputs
#--------------------------------------------------------------

output "log_lambda_name" {
  description = "Log lambda function name."
  value       = var.enable_log_lambda ? aws_lambda_function.log[0].function_name : null
}

output "log_lambda_invoke_arn" {
  description = "Log lambda invoke ARN."
  value       = var.enable_log_lambda ? aws_lambda_function.log[0].invoke_arn : null
}

output "aml_lambda_name" {
  description = "AML lambda function name."
  value       = var.enable_aml_lambda ? aws_lambda_function.aml[0].function_name : null
}

output "transaction_ingestion_lambda_name" {
  description = "Transaction ingestion Lambda function name."
  value       = var.enable_transaction_ingestion_lambda ? aws_lambda_function.transaction_ingestion[0].function_name : null
}

output "audit_consumer_lambda_name" {
  description = "Audit consumer Lambda function name."
  value       = var.enable_audit_consumer ? aws_lambda_function.audit_consumer[0].function_name : null
}

output "aml_consumer_lambda_name" {
  description = "AML consumer Lambda function name."
  value       = var.enable_aml_consumer ? aws_lambda_function.aml_consumer[0].function_name : null
}

output "verification_lambda_name" {
  description = "Verification Lambda function name."
  value       = var.enable_verification_lambda ? aws_lambda_function.verification[0].function_name : null
}
