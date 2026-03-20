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
aws_region  = "us-east-1"

# --- Network ---
enable_multi_az_nat = false # single-AZ NAT saves cost in lab

# --- ECS ---
client_desired_count = 1 # minimal footprint
ecs_max_capacity     = 2

# --- Database ---
db_instance_class        = "db.t4g.micro"
db_engine_version        = "17"  # explicit; AWS now defaults to 17, parameter group family must match
db_multi_az              = false # not needed for testing
db_backup_retention_days = 1
db_skip_final_snapshot   = true  # allow clean teardown
db_deletion_protection   = false # allow clean teardown
db_max_allocated_storage = 20

# --- Lambda (all disabled until artifacts are built) ---
enable_log_lambda                   = false
enable_aml_lambda                   = false
enable_transaction_ingestion_lambda = false
enable_audit_pipeline               = false
enable_aml_pipeline                 = false
enable_verification_pipeline        = false

# --- Network (reduced for first deploy) ---
enable_vpc_flow_logs = false # avoids extra IAM role; re-enable after first deploy

# --- Observability & Security (reduced for cost) ---
enable_waf                    = false
enable_cloudtrail             = false
enable_cloudwatch_alarms      = false
enable_backup                 = false
cloudwatch_log_retention_days = 7

# --- S3 / CloudFront ---
frontend_bucket_force_destroy = true # allow clean teardown
frontend_bucket_allow_public  = true # S3 static website hosting (no CloudFront in lab)
cloudfront_price_class        = "PriceClass_100"

# --- Auth ---
enable_cognito = true
auth_mode      = "hybrid"

# --- Learner Lab LabRole restrictions ---
# LabRole cannot create IAM roles, CloudFront distributions, or Cloud Map namespaces.
lab_role_arn             = "arn:aws:iam::231570205144:role/LabRole"
enable_cloudfront        = false
enable_cloudfront_oac    = false # moot when enable_cloudfront=false, kept for clarity
enable_service_discovery = false
enable_codedeploy        = false # CodeDeploy module creates IAM role; disabled under LabRole restrictions

# --- Service Docker Image Tags  ---
user_image_tag        = "user-lab-001"
client_image_tag      = "client-lab-001"
transaction_image_tag = "transaction-lab-001"