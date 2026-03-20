#--------------------------------------------------------------
# Local Values
# Computed values and derived names used across the root configuration.
# Centralises naming conventions, bucket names, and conditional logic.
#--------------------------------------------------------------

locals {
  #--------------------------------------------------------------
  # Naming and Tagging
  #--------------------------------------------------------------
  name_prefix = lower(replace("${var.project_name}-${var.environment}", "_", "-"))

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.extra_tags
  )

  #--------------------------------------------------------------
  # Domain and URL Resolution
  #--------------------------------------------------------------
  use_custom_domain = var.app_domain_name != ""

  alb_origin_domain_name = local.use_custom_domain ? "${var.alb_origin_subdomain}.${var.app_domain_name}" : null

  crm_api_base_url = var.aml_crm_api_base_url != "" ? var.aml_crm_api_base_url : (
    local.use_custom_domain ? "https://${local.alb_origin_domain_name}" : "http://${module.alb.alb_dns_name}"
  )

  transaction_import_api_base_url = var.transaction_import_api_base_url != "" ? var.transaction_import_api_base_url : local.crm_api_base_url

  #--------------------------------------------------------------
  # S3 Bucket Names
  #--------------------------------------------------------------
  frontend_bucket_name = var.frontend_bucket_name != "" ? lower(var.frontend_bucket_name) : lower("${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}")

  verification_bucket_name = var.verification_bucket_name != "" ? var.verification_bucket_name : "${local.name_prefix}-verification-${data.aws_caller_identity.current.account_id}"

  transaction_sftp_bucket_name = var.transaction_sftp_bucket_name != "" ? var.transaction_sftp_bucket_name : "${local.name_prefix}-transaction-sftp-${data.aws_caller_identity.current.account_id}"

  #--------------------------------------------------------------
  # Subnet Selection
  # Use dedicated DB subnets if provided, otherwise fall back to private subnets
  #--------------------------------------------------------------
  db_subnet_ids = length(var.db_subnet_cidrs) > 0 ? module.network.db_subnet_ids : module.network.private_subnet_ids

  ecs_subnet_ids = var.ecs_use_public_subnets ? module.network.public_subnet_ids : module.network.private_subnet_ids

  #--------------------------------------------------------------
  # Backup Targets
  # Collect DynamoDB table ARNs for AWS Backup (filter out nulls)
  #--------------------------------------------------------------
  dynamodb_backup_arns = compact([
    module.dynamodb.audit_logs_table_arn != null ? module.dynamodb.audit_logs_table_arn : "",
    module.dynamodb.aml_reports_table_arn != null ? module.dynamodb.aml_reports_table_arn : "",
  ])
}
