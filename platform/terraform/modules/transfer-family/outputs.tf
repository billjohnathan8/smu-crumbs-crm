#--------------------------------------------------------------
# SFTP Ingestion Module - Outputs
#--------------------------------------------------------------

output "sftp_server_id" {
  description = "Transfer Family server ID when managed mode is enabled."
  value       = var.enable_transfer_family_sftp ? aws_transfer_server.sftp[0].id : ""
}

output "sftp_ec2_instance_id" {
  description = "EC2 instance ID when self-hosted SFTP mode is enabled."
  value       = var.enable_ec2_sftp_server ? aws_instance.sftp_ec2[0].id : ""
}

output "sftp_endpoint" {
  description = "SFTP endpoint hostname or IP (Transfer Family endpoint or EC2 EIP/public DNS)."
  value = var.enable_transfer_family_sftp ? aws_transfer_server.sftp[0].endpoint : (
    var.enable_ec2_sftp_server ? (
      var.sftp_allocate_eip ? aws_eip.sftp_ec2[0].public_ip : aws_instance.sftp_ec2[0].public_ip
    ) : ""
  )
}

output "sftp_username" {
  description = "SFTP username for transaction file uploads."
  value = (var.enable_transfer_family_sftp || var.enable_ec2_sftp_server) ? (
    var.sftp_username
  ) : ""
}

output "sftp_home_directory_target" {
  description = "S3 path where uploaded files land."
  value       = (var.enable_transfer_family_sftp || var.enable_ec2_sftp_server) ? "s3://${var.transaction_bucket_id}/${var.transaction_bucket_prefix}" : ""
}
