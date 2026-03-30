#--------------------------------------------------
# Integration Contract - Terraform Variable Values
#--------------------------------------------------
# This profile is for the shared integration environment.
# It keeps cost-sensitive infrastructure lean while enabling core
# project-required runtime features for end-to-end validation.
#--------------------------------------------------

# --- General ---
environment = "integration"
aws_region  = "ap-southeast-1"

# --- Network / ECS ---
enable_stateful_service_scale_out  = false
enable_multi_az_nat                = true
enable_nat_gateway                 = true
enable_vpc_flow_logs               = true
restrict_alb_ingress_to_cloudfront = true
user_desired_count                 = 1
client_desired_count               = 2
transaction_desired_count          = 1
ecs_min_capacity                   = 2
ecs_use_public_subnets             = false
ecs_assign_public_ip               = false
enable_ecs_container_insights      = false
enable_service_discovery           = true

# --- Database ---
db_instance_class                = "db.t4g.micro"
db_multi_az                      = false
db_backup_retention_days         = 1
db_skip_final_snapshot           = true
db_deletion_protection           = false
db_max_allocated_storage         = 20
rds_performance_insights_enabled = false

# --- S3 Buckets (Fixed Names) ---
frontend_bucket_name         = "crumbs-scroogebank-frontend"
transaction_sftp_bucket_name = "crumbs-scroogebank-backend"
verification_bucket_name     = "crumbs-scroogebank-verification"

# --- Feature Contract (integration) ---
enable_log_lambda                 = true
enable_sftp_transaction_collector = true
enable_transfer_family_sftp       = true # Enable AWS Transfer Family SFTP for demo/testing
enable_verification_pipeline      = true
ses_sender_email                  = "verification@crm.local" # replace with a verified sender in real AWS integration

enable_aml_lambda     = false # requires real SFTP endpoint + key ownership contract
enable_audit_pipeline = false # implemented but disabled by default in integration profile
enable_aml_pipeline   = false # implemented but disabled by default in integration profile

# --- Security / Observability ---
enable_waf                    = true
enable_cloudtrail             = true
enable_cloudwatch_alarms      = true
alarm_notification_email      = "crm-alerts-integration@crm.local" # replace with a monitored mailbox before apply
enable_backup                 = true
cloudwatch_log_retention_days = 7

# --- GuardDuty Threat Detection ---
enable_guardduty                 = true
guardduty_notification_enabled   = false # Start with notifications OFF to establish baseline
guardduty_high_severity_only     = true  # Only notify on HIGH/CRITICAL when enabled
guardduty_finding_frequency      = "FIFTEEN_MINUTES"

# --- Frontend / Auth ---
enable_cloudfront         = true
enable_cloudfront_oac     = true
enable_cognito            = true
cognito_mfa_configuration = "OPTIONAL"
auth_mode                 = "cognito"
cloudfront_price_class    = "PriceClass_100"
# Required when app_domain_name is not set and enable_verification_pipeline=true.
# verification_frontend_base_url = "https://<your-frontend-domain>"

# --- Domain / DNS ---
manage_route53_records            = false
manage_acm_dns_validation_records = false
create_acm_certificates           = false
