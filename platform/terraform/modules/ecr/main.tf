#--------------------------------------------------------------
# ECR Module
# Elastic Container Registry for backend service Docker images.
#--------------------------------------------------------------

locals {
  repository_name = var.ecr_repository_name != "" ? var.ecr_repository_name : "${var.name_prefix}-services"
}

resource "aws_ecr_repository" "app" {
  name                 = local.repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain latest 100 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 100
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
