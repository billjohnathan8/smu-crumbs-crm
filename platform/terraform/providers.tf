#--------------------------------------------------------------
# Terraform Configuration
# Defines required version, backend configuration, and provider requirements
#--------------------------------------------------------------
terraform {
  required_version = ">= 1.6.0"

  # Partial backend config: set bucket/key/region via -backend-config
  # Example: terraform init -backend-config="bucket=my-bucket" -backend-config="key=path/to/terraform.tfstate" -backend-config="region=ap-southeast-1"
  # NOTE: Backend commented out for local state during development/validation
  # Uncomment and configure when ready to use remote state
  # backend "s3" {
  #   encrypt      = true
  #   use_lockfile = true
  # }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

#--------------------------------------------------------------
# AWS Provider Configuration
# Primary region provider with default tags applied to all resources
#--------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

#--------------------------------------------------------------
# AWS Provider for US East 1
# Required for CloudFront certificates (must be in us-east-1)
#--------------------------------------------------------------
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}

#--------------------------------------------------------------
# AWS Provider for AP Southeast 1
# Explicit alias for regional resources (ACM certificates).
#--------------------------------------------------------------
provider "aws" {
  alias  = "ap_southeast_1"
  region = "ap-southeast-1"

  default_tags {
    tags = local.common_tags
  }
}
