#--------------------------------------------------------------
# Observability Module - Outputs
#--------------------------------------------------------------

output "cloudtrail_arn" {
  description = "CloudTrail ARN."
  value       = var.enable_cloudtrail ? aws_cloudtrail.this[0].arn : null
}

output "cloudtrail_bucket_name" {
  description = "CloudTrail S3 bucket name."
  value       = var.enable_cloudtrail ? aws_s3_bucket.cloudtrail[0].id : null
}
