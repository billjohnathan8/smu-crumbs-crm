#--------------------------------------------------------------
# SFTP Ingestion Module - Variables
# Supports either AWS Transfer Family or self-hosted EC2 SFTP.
#--------------------------------------------------------------

variable "enable_transfer_family_sftp" {
  description = "Enable AWS Transfer Family SFTP server for transaction file ingestion."
  type        = bool
  default     = false
}

variable "enable_ec2_sftp_server" {
  description = "Enable self-hosted EC2 SFTP server for transaction file ingestion."
  type        = bool
  default     = false
}

variable "name_prefix" {
  description = "Naming prefix for all SFTP resources."
  type        = string
}

variable "environment" {
  description = "Environment name (dev, integration, prod)."
  type        = string
}

variable "aws_region" {
  description = "AWS region where resources are provisioned."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the EC2 SFTP security group is created."
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs. First subnet is used by default for EC2 SFTP."
  type        = list(string)
}

variable "sftp_server_subnet_id" {
  description = "Optional subnet ID override for EC2 SFTP instance."
  type        = string
  default     = ""
}

variable "sftp_instance_type" {
  description = "EC2 instance type for self-hosted SFTP."
  type        = string
  default     = "t4g.micro"
}

variable "sftp_root_volume_size_gb" {
  description = "Root EBS volume size for EC2 SFTP instance."
  type        = number
  default     = 8
}

variable "sftp_ingress_cidr_blocks" {
  description = "Allowed CIDR blocks for SFTP ingress on port 22."
  type        = list(string)
  default     = []
}

variable "sftp_server_ami_id" {
  description = "Optional AMI override for EC2 SFTP instance."
  type        = string
  default     = ""
}

variable "sftp_allocate_eip" {
  description = "Attach an Elastic IP to EC2 SFTP instance."
  type        = bool
  default     = true
}

variable "transaction_bucket_id" {
  description = "S3 bucket ID where transaction files are stored (landing zone)."
  type        = string
}

variable "transaction_bucket_arn" {
  description = "S3 bucket ARN where transaction files are stored (landing zone)."
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
  description = "SSH public key for SFTP user authentication (OpenSSH format)."
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
  default     = ""
}
