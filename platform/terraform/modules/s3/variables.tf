#--------------------------------------------------------------
# S3 Module - Variables
#--------------------------------------------------------------

variable "frontend_bucket_name" {
  description = "Frontend S3 bucket name."
  type        = string
}

variable "frontend_bucket_force_destroy" {
  description = "Allow destroying non-empty frontend bucket."
  type        = bool
}

variable "frontend_bucket_allow_public" {
  description = "Disable S3 public access block on the frontend bucket. Required when using S3 static website hosting without CloudFront."
  type        = bool
  default     = false
}

variable "enable_verification_bucket" {
  description = "Create S3 bucket for verification document uploads."
  type        = bool
  default     = false
}

variable "verification_bucket_name" {
  description = "Verification documents S3 bucket name."
  type        = string
  default     = ""
}

variable "enable_transaction_sftp_bucket" {
  description = "Create S3 bucket for mocked transaction SFTP source files."
  type        = bool
  default     = false
}

variable "transaction_sftp_bucket_name" {
  description = "Mocked transaction SFTP source S3 bucket name."
  type        = string
  default     = ""
}
