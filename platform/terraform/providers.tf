#--------------------------------------------------------------
# Terraform Configuration
# Defines required version, backend configuration, and provider requirements
#--------------------------------------------------------------
terraform {
  required_version = ">= 1.6.0"

  # Remote state in S3 with partial backend config.
  # Initialise with: terraform init -backend-config=env/<env>.backend.hcl
  # Switch environments with: terraform init -reconfigure -backend-config=env/<env>.backend.hcl
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }

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
