#--------------------------------------------------------------
# Lambda Module - Outputs
#--------------------------------------------------------------

output "log_lambda_name" {
  description = "Log lambda function name."
  value       = aws_lambda_function.log.function_name
}

output "log_lambda_invoke_arn" {
  description = "Log lambda invoke ARN."
  value       = aws_lambda_function.log.invoke_arn
}

output "aml_lambda_name" {
  description = "AML lambda function name."
  value       = aws_lambda_function.aml.function_name
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
