#--------------------------------------------------------------
# Transfer Family Module - Variables
#--------------------------------------------------------------

variable "enable_transfer_family_sftp" {
  description = "Enable AWS Transfer Family SFTP server for transaction file ingestion."
  type        = bool
  default     = false
}

variable "name_prefix" {
  description = "Naming prefix for all Transfer Family resources."
  type        = string
}

variable "environment" {
  description = "Environment name (dev, integration, prod)."
  type        = string
}

variable "transaction_bucket_id" {
  description = "S3 bucket ID where transaction files are stored (landing zone)."
  type        = string
}

variable "transaction_bucket_prefix" {
  description = "S3 object prefix for transaction files (e.g., 'incoming/')."
  type        = string
  default     = "incoming/"

  validation {
    condition     = can(regex(".*/$", var.transaction_bucket_prefix)) || var.transaction_bucket_prefix == ""
    error_message = "transaction_bucket_prefix must end with '/' or be empty."
  }
}

variable "sftp_username" {
  description = "SFTP username for transaction file uploads."
  type        = string
  default     = "crm-transaction-uploader"

  validation {
    condition     = can(regex("^[a-zA-Z0-9_-]+$", var.sftp_username))
    error_message = "sftp_username must contain only alphanumeric characters, hyphens, and underscores."
  }
}

variable "sftp_user_ssh_public_key" {
  description = "SSH public key for SFTP user authentication (OpenSSH format). Example: 'ssh-rsa AAAAB3NzaC1yc2EA... user@host'"
  type        = string
  default     = ""

  validation {
    condition     = var.sftp_user_ssh_public_key == "" || can(regex("^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521) ", var.sftp_user_ssh_public_key))
    error_message = "sftp_user_ssh_public_key must be a valid SSH public key in OpenSSH format or empty string."
  }
}

variable "transfer_family_role_arn" {
  description = "IAM role ARN for Transfer Family user to access S3 bucket."
  type        = string
}
