#--------------------------------------------------
# Learner Lab - Terraform Variable Values
#--------------------------------------------------
# Non-sensitive values only.
# Sensitive values must be set via environment variables:
#   export TF_VAR_jwt_hmac_secret="<random-32-chars>"
#   export TF_VAR_root_admin_password="<strong-password>"
#--------------------------------------------------

# --- General ---
environment = "lab"

# --- Network ---
enable_multi_az_nat = false          # single-AZ NAT saves cost in lab

# --- ECS ---
client_desired_count = 1             # minimal footprint
ecs_max_capacity     = 2

# --- Database ---
db_instance_class       = "db.t4g.micro"
db_multi_az             = false      # not needed for testing
db_backup_retention_days = 1
db_skip_final_snapshot  = true       # allow clean teardown
db_deletion_protection  = false      # allow clean teardown
db_max_allocated_storage = 20

# --- Lambda (all disabled until artifacts are built) ---
enable_log_lambda                = false
enable_aml_lambda                = false
enable_transaction_ingestion_lambda = false
enable_audit_pipeline            = false
enable_aml_pipeline              = false
enable_verification_pipeline     = false

# --- Network (reduced for first deploy) ---
enable_vpc_flow_logs = false            # avoids extra IAM role; re-enable after first deploy

# --- Observability & Security (reduced for cost) ---
enable_waf              = false
enable_cloudtrail       = false
enable_cloudwatch_alarms = false
enable_backup           = false
cloudwatch_log_retention_days = 7

# --- S3 / CloudFront ---
frontend_bucket_force_destroy = true  # allow clean teardown
cloudfront_price_class        = "PriceClass_100"

# --- Auth ---
enable_cognito = true
auth_mode      = "hybrid"
