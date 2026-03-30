#--------------------------------------------------------------
# Transfer Family Module
# AWS Transfer Family SFTP server for external transaction file ingestion
#--------------------------------------------------------------

#--------------------------------------------------------------
# AWS Transfer Server (SFTP)
# Public endpoint with service-managed identity provider
#--------------------------------------------------------------
resource "aws_transfer_server" "sftp" {
  count = var.enable_transfer_family_sftp ? 1 : 0

  endpoint_type          = "PUBLIC"
  protocols              = ["SFTP"]
  identity_provider_type = "SERVICE_MANAGED"

  tags = {
    Name        = "${var.name_prefix}-sftp"
    Environment = var.environment
    Purpose     = "Transaction file ingestion via SFTP"
  }
}

#--------------------------------------------------------------
# Transfer User
# SFTP user with SSH key authentication and S3 home directory mapping
#--------------------------------------------------------------
resource "aws_transfer_user" "sftp_user" {
  count = var.enable_transfer_family_sftp ? 1 : 0

  server_id = aws_transfer_server.sftp[0].id
  user_name = var.sftp_username
  role      = var.transfer_family_role_arn

  # Map SFTP user's home directory to S3 bucket prefix
  home_directory_type = "LOGICAL"
  home_directory_mappings {
    entry  = "/"
    target = "/${var.transaction_bucket_id}/${var.transaction_bucket_prefix}"
  }

  tags = {
    Name        = "${var.name_prefix}-sftp-user"
    Environment = var.environment
  }
}

#--------------------------------------------------------------
# SSH Public Key for SFTP User
# Service-managed authentication using provided SSH public key
#--------------------------------------------------------------
resource "aws_transfer_ssh_key" "sftp_user" {
  count = var.enable_transfer_family_sftp && var.sftp_user_ssh_public_key != "" ? 1 : 0

  server_id = aws_transfer_server.sftp[0].id
  user_name = aws_transfer_user.sftp_user[0].user_name
  body      = var.sftp_user_ssh_public_key
}
