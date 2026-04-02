#--------------------------------------------------
# Production Destroy Overrides
#--------------------------------------------------
# Use only for intentional teardown runs.
# Stack this file after prod.tfvars so normal deploy defaults remain safe:
#   terraform destroy -var-file=env/prod.tfvars -var-file=env/prod.destroy.tfvars
#--------------------------------------------------

# Allow deleting versioned/non-empty buckets during destroy.
frontend_bucket_force_destroy         = true
backend_bucket_force_destroy          = true
transaction_sftp_bucket_force_destroy = true
