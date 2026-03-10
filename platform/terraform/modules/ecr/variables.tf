#--------------------------------------------------------------
# ECR Module - Variables
#--------------------------------------------------------------

variable "name_prefix" {
  description = "Global naming prefix."
  type        = string
}

variable "ecr_repository_name" {
  description = "Optional explicit ECR repository name."
  type        = string
  default     = ""
}
