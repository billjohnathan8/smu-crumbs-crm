#--------------------------------------------------------------
# Lambda Module - Variables
#--------------------------------------------------------------

variable "name_prefix" {
  description = "Global naming prefix."
  type        = string
}

variable "project_name" {
  description = "Project name used in SSM parameter paths."
  type        = string
}

variable "environment" {
  description = "Environment name used in SSM parameter paths."
  type        = string
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
}

variable "enable_log_lambda" {
  description = "Create the log Lambda function."
  type        = bool
  default     = true
}

variable "log_lambda_zip_path" {
  description = "Path to the log lambda zip."
  type        = string

  validation {
    condition = !var.enable_log_lambda || (
      trimspace(var.log_lambda_zip_path) != "" &&
      fileexists(var.log_lambda_zip_path) &&
      filesize(var.log_lambda_zip_path) > 0
    )
    error_message = "When enable_log_lambda is true, log_lambda_zip_path must point to an existing, non-empty zip file."
  }
}

variable "log_lambda_memory_size" {
  description = "Log lambda memory size."
  type        = number
}

variable "log_lambda_timeout_seconds" {
  description = "Log lambda timeout in seconds."
  type        = number
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda VPC config."
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Lambda security group ID."
  type        = string
}

variable "log_lambda_role_arn" {
  description = "Log Lambda IAM role ARN."
  type        = string
}

variable "db_host" {
  description = "Database host for log Lambda."
  type        = string
}

variable "db_port" {
  description = "Database port for log Lambda."
  type        = number
}

variable "db_name" {
  description = "Database name for log Lambda."
  type        = string
}

variable "db_username_secret_arn" {
  description = "DB username secret ARN."
  type        = string
}

variable "db_password_secret_arn" {
  description = "DB password secret ARN."
  type        = string
}

variable "jwt_hmac_secret_arn" {
  description = "JWT secret ARN."
  type        = string
}

variable "auth_mode" {
  description = "Runtime auth mode for the log Lambda (local, hybrid, cognito)."
  type        = string
  default     = "hybrid"
}

variable "cognito_issuer_url" {
  description = "Cognito issuer URL for RS256 token validation."
  type        = string
  default     = ""
}

variable "cognito_jwks_url" {
  description = "Cognito JWKS endpoint URL for RS256 token validation."
  type        = string
  default     = ""
}

variable "cognito_audience" {
  description = "Cognito App Client ID used as the audience claim."
  type        = string
  default     = ""
}

variable "enable_aml_lambda" {
  description = "Create the AML ingestion Lambda and schedule."
  type        = bool
  default     = true
}

variable "aml_lambda_zip_path" {
  description = "Path to AML lambda zip."
  type        = string

  validation {
    condition = !var.enable_aml_lambda || (
      trimspace(var.aml_lambda_zip_path) != "" &&
      fileexists(var.aml_lambda_zip_path) &&
      filesize(var.aml_lambda_zip_path) > 0
    )
    error_message = "When enable_aml_lambda is true, aml_lambda_zip_path must point to an existing, non-empty zip file."
  }
}

variable "aml_lambda_memory_size" {
  description = "AML lambda memory size."
  type        = number
}

variable "aml_lambda_timeout_seconds" {
  description = "AML lambda timeout in seconds."
  type        = number
}

variable "aml_lambda_role_arn" {
  description = "AML lambda IAM role ARN."
  type        = string
}

variable "aml_schedule_expression" {
  description = "EventBridge schedule expression."
  type        = string
}

variable "aml_sftp_host" {
  description = "SFTP host."
  type        = string
}

variable "aml_sftp_port" {
  description = "SFTP port."
  type        = number
}

variable "aml_sftp_user" {
  description = "SFTP username."
  type        = string
}

variable "aml_sftp_key_secret_arn" {
  description = "SFTP private key secret ARN."
  type        = string
}

variable "aml_sftp_remote_path" {
  description = "Remote SFTP path."
  type        = string
}

variable "aml_entity_id" {
  description = "AML entity id."
  type        = string
}

variable "crm_api_base_url" {
  description = "CRM API base URL for AML lambda."
  type        = string
}

variable "enable_transaction_ingestion_lambda" {
  description = "Create the transaction ingestion Lambda and schedule."
  type        = bool
  default     = false
}

variable "transaction_ingestion_lambda_zip_path" {
  description = "Path to transaction ingestion lambda zip."
  type        = string
  default     = ""

  validation {
    condition = !var.enable_transaction_ingestion_lambda || (
      trimspace(var.transaction_ingestion_lambda_zip_path) != "" &&
      fileexists(var.transaction_ingestion_lambda_zip_path) &&
      filesize(var.transaction_ingestion_lambda_zip_path) > 0
    )
    error_message = "When enable_transaction_ingestion_lambda is true, transaction_ingestion_lambda_zip_path must point to an existing, non-empty zip file."
  }
}

variable "transaction_ingestion_lambda_memory_size" {
  description = "Transaction ingestion lambda memory size."
  type        = number
  default     = 512
}

variable "transaction_ingestion_lambda_timeout_seconds" {
  description = "Transaction ingestion lambda timeout in seconds."
  type        = number
  default     = 60
}

variable "transaction_ingestion_lambda_role_arn" {
  description = "Transaction ingestion Lambda IAM role ARN."
  type        = string
  default     = ""
}

variable "transaction_ingestion_schedule_expression" {
  description = "EventBridge schedule expression for transaction ingestion Lambda."
  type        = string
  default     = "rate(1 hour)"
}

variable "transaction_sftp_bucket_id" {
  description = "S3 bucket ID used as mocked transaction SFTP source."
  type        = string
  default     = ""
}

variable "transaction_sftp_remote_prefix" {
  description = "S3 object prefix used by transaction ingestion Lambda."
  type        = string
  default     = "incoming/"
}

variable "transaction_import_api_url" {
  description = "Transaction import API URL called by the ingestion Lambda."
  type        = string
  default     = ""
}

# --- Audit consumer Lambda (SQS → DynamoDB) ---

variable "enable_audit_consumer" {
  description = "Create audit SQS consumer Lambda."
  type        = bool
  default     = false
}

variable "audit_consumer_zip_path" {
  description = "Path to audit consumer Lambda zip."
  type        = string
  default     = ""

  validation {
    condition = !var.enable_audit_consumer || (
      trimspace(var.audit_consumer_zip_path) != "" &&
      fileexists(var.audit_consumer_zip_path) &&
      filesize(var.audit_consumer_zip_path) > 0
    )
    error_message = "When enable_audit_consumer is true, audit_consumer_zip_path must point to an existing, non-empty zip file."
  }
}

variable "audit_consumer_role_arn" {
  description = "IAM role ARN for audit consumer Lambda."
  type        = string
  default     = ""
}

variable "audit_consumer_memory_size" {
  description = "Memory size for audit consumer Lambda."
  type        = number
  default     = 256
}

variable "audit_consumer_timeout_seconds" {
  description = "Timeout for audit consumer Lambda."
  type        = number
  default     = 30
}

variable "audit_sqs_arn" {
  description = "ARN of audit SQS queue for event source mapping."
  type        = string
  default     = ""
}

variable "audit_dynamodb_table_name" {
  description = "DynamoDB table name for audit logs."
  type        = string
  default     = ""
}

# --- AML consumer Lambda (SQS → DynamoDB) ---

variable "enable_aml_consumer" {
  description = "Create AML SQS consumer Lambda."
  type        = bool
  default     = false
}

variable "aml_consumer_zip_path" {
  description = "Path to AML consumer Lambda zip."
  type        = string
  default     = ""

  validation {
    condition = !var.enable_aml_consumer || (
      trimspace(var.aml_consumer_zip_path) != "" &&
      fileexists(var.aml_consumer_zip_path) &&
      filesize(var.aml_consumer_zip_path) > 0
    )
    error_message = "When enable_aml_consumer is true, aml_consumer_zip_path must point to an existing, non-empty zip file."
  }
}

variable "aml_consumer_role_arn" {
  description = "IAM role ARN for AML consumer Lambda."
  type        = string
  default     = ""
}

variable "aml_consumer_memory_size" {
  description = "Memory size for AML consumer Lambda."
  type        = number
  default     = 512
}

variable "aml_consumer_timeout_seconds" {
  description = "Timeout for AML consumer Lambda."
  type        = number
  default     = 120
}

variable "aml_sqs_arn" {
  description = "ARN of AML SQS queue for event source mapping."
  type        = string
  default     = ""
}

variable "aml_dynamodb_table_name" {
  description = "DynamoDB table name for AML reports."
  type        = string
  default     = ""
}

# --- Verification Lambda (S3 → SNS → SES) ---

variable "enable_verification_lambda" {
  description = "Create verification Lambda."
  type        = bool
  default     = false
}

variable "verification_zip_path" {
  description = "Path to verification Lambda zip."
  type        = string
  default     = ""

  validation {
    condition = !var.enable_verification_lambda || (
      trimspace(var.verification_zip_path) != "" &&
      fileexists(var.verification_zip_path) &&
      filesize(var.verification_zip_path) > 0
    )
    error_message = "When enable_verification_lambda is true, verification_zip_path must point to an existing, non-empty zip file."
  }
}

variable "verification_role_arn" {
  description = "IAM role ARN for verification Lambda."
  type        = string
  default     = ""
}

variable "verification_memory_size" {
  description = "Memory size for verification Lambda."
  type        = number
  default     = 256
}

variable "verification_timeout_seconds" {
  description = "Timeout for verification Lambda."
  type        = number
  default     = 30
}

variable "verification_bucket_arn" {
  description = "S3 bucket ARN for verification document uploads."
  type        = string
  default     = ""
}

variable "verification_bucket_id" {
  description = "S3 bucket ID for verification document uploads."
  type        = string
  default     = ""
}

variable "verification_sns_topic_arn" {
  description = "SNS topic ARN for verification events."
  type        = string
  default     = ""
}

variable "ses_sender_email" {
  description = "SES verified sender email for verification notifications."
  type        = string
  default     = ""
}

variable "log_api_base_url" {
  description = "Log API base URL used by verification feedback Lambda."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_verification_lambda || trimspace(var.log_api_base_url) != ""
    error_message = "When enable_verification_lambda is true, log_api_base_url must be non-empty."
  }
}

variable "verification_jwt_hmac_secret_arn" {
  description = "JWT HMAC secret ARN used by verification feedback Lambda for internal service auth."
  type        = string
  default     = ""
}
