#--------------------------------------------------
# Production - Terraform Variable Values
#--------------------------------------------------
# Non-sensitive values only.
# Sensitive values must be set via environment variables:
#   export TF_VAR_jwt_hmac_secret="<random-32-chars>"
#   export TF_VAR_root_admin_password="<strong-password-16+chars-upper-lower-digit-symbol>"
#--------------------------------------------------

# --- General ---
environment = "prod"

# --- Network ---
enable_multi_az_nat = true # required for prod (guardrail-enforced)
enable_nat_gateway  = true # required for prod (guardrail-enforced)

# --- ECS ---
client_desired_count   = 2
ecs_max_capacity       = 4
ecs_use_public_subnets = false
ecs_assign_public_ip   = false

# --- Database ---
db_instance_class        = "db.t4g.micro" # school budget; upgrade if needed
db_multi_az              = true           # required for prod (guardrail-enforced)
db_backup_retention_days = 7              # minimum for prod (guardrail-enforced)
db_skip_final_snapshot   = false          # required for prod (guardrail-enforced)
db_deletion_protection   = true           # required for prod (guardrail-enforced)
db_max_allocated_storage = 100

# --- Lambda (all disabled until artifacts are built) ---
enable_log_lambda                   = false
enable_aml_lambda                   = false
enable_transaction_ingestion_lambda = false
enable_audit_pipeline               = false
enable_aml_pipeline                 = false
enable_verification_pipeline        = false

# --- Observability & Security ---
enable_waf                    = true
enable_cloudtrail             = true
enable_cloudwatch_alarms      = true
enable_backup                 = true
backup_retention_days         = 30
cloudwatch_log_retention_days = 30

# --- S3 / CloudFront ---
frontend_bucket_force_destroy = false
cloudfront_price_class        = "PriceClass_100"

# --- Auth ---
enable_cognito = true
auth_mode      = "hybrid"

# --- Domain (fill in when school provides) ---
# app_domain_name       = ""
# route53_hosted_zone_id = ""
