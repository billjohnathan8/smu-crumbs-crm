#--------------------------------------------------------------
# SNS Module - Outputs
#--------------------------------------------------------------

output "verification_topic_arn" {
  description = "Verification SNS topic ARN."
  value       = var.enable_verification_pipeline ? aws_sns_topic.verification[0].arn : null
}

output "verification_topic_name" {
  description = "Verification SNS topic name."
  value       = var.enable_verification_pipeline ? aws_sns_topic.verification[0].name : null
}
