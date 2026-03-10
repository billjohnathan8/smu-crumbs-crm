#--------------------------------------------------------------
# ECS Module - Main Configuration
# This file contains local variables and the ECS cluster definition
#--------------------------------------------------------------

# Service-specific configurations including desired count, image tags,
# environment variables, and secrets
locals {
  service_configs = {
    agent = {
      desired_count = var.desired_counts.agent
      image_tag     = var.image_tags.agent
      environment = [
        {
          name  = "ROOT_ADMIN_EMAIL"
          value = var.root_admin_email
        }
      ]
      secrets = [
        {
          name      = "ROOT_ADMIN_PASSWORD"
          valueFrom = var.root_admin_password_secret_arn
        },
        {
          name      = "JWT_HMAC_SECRET"
          valueFrom = var.jwt_hmac_secret_arn
        }
      ]
    }
    client = {
      desired_count = var.desired_counts.client
      image_tag     = var.image_tags.client
      environment = [
        {
          name  = "SPRING_DATASOURCE_URL"
          value = var.db_jdbc_url
        },
        {
          name  = "LOG_SERVICE_URL"
          value = var.log_api_base_url
        }
      ]
      secrets = [
        {
          name      = "SPRING_DATASOURCE_USERNAME"
          valueFrom = var.db_username_secret_arn
        },
        {
          name      = "SPRING_DATASOURCE_PASSWORD"
          valueFrom = var.db_password_secret_arn
        },
        {
          name      = "JWT_HMAC_SECRET"
          valueFrom = var.jwt_hmac_secret_arn
        }
      ]
    }
    transaction = {
      desired_count = var.desired_counts.transaction
      image_tag     = var.image_tags.transaction
      environment = [
        {
          name  = "CLIENT_SERVICE_URL"
          value = local.client_service_internal_url
        },
        {
          name  = "MOCK_SFTP_ROOT"
          value = var.transaction_mock_sftp_root
        }
      ]
      secrets = [
        {
          name      = "JWT_HMAC_SECRET"
          valueFrom = var.jwt_hmac_secret_arn
        }
      ]
    }
  }

  # CloudMap namespace for service discovery
  cloudmap_namespace_name     = "${var.environment}.${var.project_name}.internal"
  client_service_internal_url = "http://client.${local.cloudmap_namespace_name}:8080"
  task_definition_template    = "${path.module}/../../template/ecs_json.tpl"
}

# ECS Cluster with Container Insights enabled for monitoring
resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-ecs"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
