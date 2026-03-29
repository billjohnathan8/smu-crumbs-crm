#--------------------------------------------------
# Integration - Terraform Remote State Backend
#--------------------------------------------------
# Prerequisites (create once manually in integration AWS account):
#   aws s3api create-bucket --bucket crumbs-scroogebank-tfstate \
#     --region ap-southeast-1 \
#     --create-bucket-configuration LocationConstraint=ap-southeast-1
#   aws s3api put-bucket-versioning --bucket crumbs-scroogebank-tfstate \
#     --versioning-configuration Status=Enabled
#   aws dynamodb create-table --table-name crumbs-scroogebank-tflock-integration \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region ap-southeast-1
#--------------------------------------------------

bucket         = "crumbs-scroogebank-tfstate"
key            = "scroogebank-crm/integration/terraform.tfstate"
region         = "ap-southeast-1"
dynamodb_table = "crumbs-scroogebank-tflock-integration"
encrypt        = true
