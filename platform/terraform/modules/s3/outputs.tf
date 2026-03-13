#--------------------------------------------------------------
# S3 Module - Outputs
#--------------------------------------------------------------

output "frontend_bucket_name" {
  description = "Frontend bucket name."
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_bucket_id" {
  description = "Frontend bucket ID."
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "Frontend bucket ARN."
  value       = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_regional_domain_name" {
  description = "Frontend bucket regional domain name."
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "verification_bucket_id" {
  description = "Verification documents bucket ID."
  value       = var.enable_verification_bucket ? aws_s3_bucket.verification[0].id : null
}

output "verification_bucket_arn" {
  description = "Verification documents bucket ARN."
  value       = var.enable_verification_bucket ? aws_s3_bucket.verification[0].arn : null
}

output "transaction_sftp_bucket_name" {
  description = "Mocked transaction SFTP source bucket name."
  value       = var.enable_transaction_sftp_bucket ? aws_s3_bucket.transaction_sftp[0].bucket : null
}

output "transaction_sftp_bucket_id" {
  description = "Mocked transaction SFTP source bucket ID."
  value       = var.enable_transaction_sftp_bucket ? aws_s3_bucket.transaction_sftp[0].id : null
}

output "transaction_sftp_bucket_arn" {
  description = "Mocked transaction SFTP source bucket ARN."
  value       = var.enable_transaction_sftp_bucket ? aws_s3_bucket.transaction_sftp[0].arn : null
}
