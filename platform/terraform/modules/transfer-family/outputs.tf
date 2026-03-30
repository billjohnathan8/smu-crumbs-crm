#--------------------------------------------------------------
# Transfer Family Module - Outputs
#--------------------------------------------------------------

output "sftp_server_id" {
  description = "AWS Transfer Family server ID."
  value       = var.enable_transfer_family_sftp ? aws_transfer_server.sftp[0].id : ""
}

output "sftp_endpoint" {
  description = "AWS Transfer Family SFTP endpoint (connect using: sftp user@endpoint)."
  value       = var.enable_transfer_family_sftp ? aws_transfer_server.sftp[0].endpoint : ""
}

output "sftp_username" {
  description = "SFTP username for transaction file uploads."
  value       = var.enable_transfer_family_sftp ? aws_transfer_user.sftp_user[0].user_name : ""
}

output "sftp_home_directory_target" {
  description = "S3 path where uploaded files land (logical home directory target)."
  value       = var.enable_transfer_family_sftp ? "s3://${var.transaction_bucket_id}/${var.transaction_bucket_prefix}" : ""
}
