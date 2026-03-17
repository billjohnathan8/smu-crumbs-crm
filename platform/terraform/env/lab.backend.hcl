#--------------------------------------------------
# Learner Lab - Terraform Remote State Backend
#--------------------------------------------------
# Prerequisites (create once manually in Learner Lab console):
#   aws s3api create-bucket --bucket scroogebank-crm-lab-tfstate --region us-east-1
#   (no --create-bucket-configuration: us-east-1 is the S3 default region)
#   aws s3api put-bucket-versioning --bucket scroogebank-crm-lab-tfstate \
#     --versioning-configuration Status=Enabled
#   aws dynamodb create-table --table-name scroogebank-crm-lab-tflock \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region us-east-1
#--------------------------------------------------

bucket         = "scroogebank-crm-lab-tfstate"
key            = "scroogebank-crm/lab/terraform.tfstate"
region         = "us-east-1"
use_lockfile   = true
encrypt        = true
