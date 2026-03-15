#--------------------------------------------------
# Learner Lab - Terraform Remote State Backend
#--------------------------------------------------
# Prerequisites (create once manually in Learner Lab console):
#   aws s3api create-bucket --bucket scroogebank-crm-lab-tfstate \
#     --region ap-southeast-1 \
#     --create-bucket-configuration LocationConstraint=ap-southeast-1
#   aws s3api put-bucket-versioning --bucket scroogebank-crm-lab-tfstate \
#     --versioning-configuration Status=Enabled
#   aws dynamodb create-table --table-name scroogebank-crm-lab-tflock \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region ap-southeast-1
#--------------------------------------------------

bucket         = "scroogebank-crm-lab-tfstate"
key            = "scroogebank-crm/lab/terraform.tfstate"
region         = "ap-southeast-1"
dynamodb_table = "scroogebank-crm-lab-tflock"
encrypt        = true
