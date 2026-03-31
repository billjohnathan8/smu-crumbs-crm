#--------------------------------------------------
# Production - Terraform Variable Values
#--------------------------------------------------
# Non-sensitive values only.
# Sensitive values must be set via environment variables:
#   export TF_VAR_jwt_hmac_secret="<random-32-chars>"
#   export TF_VAR_root_admin_password="<strong-password-16+chars-upper-lower-digit-symbol>"
#--------------------------------------------------

# --- General ---
environment                    = "prod"
aws_region                     = "ap-southeast-1"
enforce_strict_prod_guardrails = false # budget-first production bring-up profile

# --- Network ---
enable_stateful_service_scale_out  = false
enable_multi_az_nat                = false
enable_nat_gateway                 = true
enable_vpc_flow_logs               = true
restrict_alb_ingress_to_cloudfront = true

# --- ECS ---
user_desired_count                = 1
client_desired_count              = 2
transaction_desired_count         = 1
ecs_min_capacity                  = 2
ecs_max_capacity                  = 2
ecs_task_cpu                      = 512
ecs_task_memory                   = 1024
ecs_production_like_ha_task_floor = 2
ecs_use_public_subnets            = false
ecs_assign_public_ip              = false
enable_ecs_container_insights     = false

# --- Database ---
db_instance_class                = "db.t4g.micro" # school budget baseline
db_multi_az                      = false
db_backup_retention_days         = 1
db_skip_final_snapshot           = true
db_deletion_protection           = false
db_max_allocated_storage         = 20
rds_performance_insights_enabled = false

# --- Feature Contract (production-like) ---
# Enabled by default for requirement-aligned runtime parity:
# - log API path
# - verification dispatch + feedback path
# - transaction ingestion scheduler path
enable_log_lambda                 = true
enable_sftp_transaction_collector = true
enable_transfer_family_sftp       = false
enable_ec2_sftp_server            = true
sftp_instance_type                = "t4g.micro"
sftp_root_volume_size_gb          = 8
sftp_ingress_cidr_blocks          = ["203.0.113.10/32"] # Replace with real partner office/public NAT CIDRs before apply.
enable_verification_pipeline      = true
ses_sender_email                  = "verification@crm.local" # replace with a real mailbox you own, then verify this identity in SES (manual email confirmation link)
ses_domain                        = ""                       # keep empty to use sender_email identity mode (manual verification)

# Intentionally disabled until prerequisites are available:
enable_aml_lambda     = true # enabled: SFTP host/user can be auto-derived from transfer_family outputs; key secret ARN must be injected at runtime
enable_audit_pipeline = true # implemented but disabled by default in production profile
enable_aml_pipeline   = true # implemented but disabled by default in production profile

# --- Observability & Security ---
enable_waf                    = false
enable_cloudtrail             = true
enable_cloudwatch_alarms      = true
alarm_notification_email      = "crm-alerts-prod@crm.local" # replace with a monitored mailbox before apply
enable_backup                 = true
enable_codedeploy             = true
backup_retention_days         = 7
cloudwatch_log_retention_days = 7

# --- GuardDuty Threat Detection ---
enable_guardduty               = true
guardduty_notification_enabled = true # Notifications enabled for prod
guardduty_high_severity_only   = true # Only HIGH/CRITICAL alerts
guardduty_finding_frequency    = "FIFTEEN_MINUTES"

# --- S3 / CloudFront ---
frontend_bucket_name          = "crumbs-scroogebank-frontend"
transaction_sftp_bucket_name  = "crumbs-scroogebank-sftp"
verification_bucket_name      = "crumbs-scroogebank-verification"
backend_bucket_name           = "crumbs-scroogebank-backend"
frontend_bucket_force_destroy = false
cloudfront_price_class        = "PriceClass_100"
enable_cloudfront             = true
enable_cloudfront_oac         = true
enable_service_discovery      = true
# Required when app_domain_name is not set and enable_verification_pipeline=true.
verification_frontend_base_url = "https://itsag2t3.com"

# --- Auth ---
enable_cognito            = true
cognito_mfa_configuration = "ON"
auth_mode                 = "cognito"

# --- Domain / DNS Ownership ---
# Keep custom-domain disabled for first bring-up unless cert + DNS ownership are ready.
# Guardrail override for this repo: allow Terraform Route53/ACM management for itsag2t3.com when you enable those flags.
allow_school_registered_domain_management = true
# For teardown while preserving DNS aliases, run scripts/destroy-app-keep-dns.(sh|ps1)
app_domain_name                   = "itsag2t3.com"
manage_route53_records            = true
manage_acm_dns_validation_records = true
create_acm_certificates           = true
route53_hosted_zone_id            = "Z07853315ON2Q60THXVB"
# existing_frontend_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
# existing_alb_certificate_arn      = "arn:aws:acm:ap-southeast-1:123456789012:certificate/..."
