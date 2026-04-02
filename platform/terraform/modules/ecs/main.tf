#--------------------------------------------------------------
# ECS Module - Main Configuration
# This file contains local variables and the ECS cluster definition
#--------------------------------------------------------------

# Service-specific configurations including desired count, image tags,
# environment variables, and secrets
locals {
  production_like_environments = toset(["prod", "production", "integration"])
  is_production_like           = contains(local.production_like_environments, lower(trimspace(var.environment)))

  # Customer-facing/core services that require an HA baseline in production-like
  # environments to avoid single-task service outages.
  critical_customer_facing_services = toset(["user", "client", "transaction"])
  critical_ha_task_floor            = var.production_like_ha_task_floor

  # Services that require conservative horizontal scaling. They can run with
  # HA redundancy, but expansion beyond the HA baseline remains gated by
  # enable_stateful_service_scale_out.
  in_memory_stateful_services = toset(["user", "transaction"])

  requested_desired_counts = {
    user        = var.desired_counts.user
    client      = var.desired_counts.client
    transaction = var.desired_counts.transaction
  }

  # Keep non-production-like environments conservative when stateful scale-out
  # is disabled, but do not apply single-task pinning in production-like envs
  # where HA redundancy is required.
  stateful_single_replica_overrides = (
    !var.enable_stateful_service_scale_out && !local.is_production_like
    ) ? {
    for service_name in local.in_memory_stateful_services : service_name => 1
  } : {}

  # Enforce a minimum desired-count HA baseline in production-like environments.
  critical_ha_desired_count_overrides = local.is_production_like ? {
    for service_name in local.critical_customer_facing_services :
    service_name => max(local.requested_desired_counts[service_name], local.critical_ha_task_floor)
  } : {}

  effective_desired_counts = merge(
    local.requested_desired_counts,
    local.stateful_single_replica_overrides,
    local.critical_ha_desired_count_overrides
  )

  service_configs = {
    user = {
      desired_count = local.effective_desired_counts.user
      image_tag     = var.image_tags.user
      environment = [
        {
          name  = "ROOT_ADMIN_EMAIL"
          value = var.root_admin_email
        },
        {
          name  = "SPRING_DATASOURCE_URL"
          value = var.db_jdbc_url
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE"
          value = "4"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE"
          value = "1"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT"
          value = "30000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT"
          value = "600000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAX_LIFETIME"
          value = "1200000"
        },
        {
          name  = "APP_USER_STORE_TYPE"
          value = "postgres"
        },
        {
          name  = "USER_LOG_SERVICE_URL"
          value = var.log_api_base_url
        },
        {
          name  = "AUTH_MODE"
          value = var.auth_mode
        },
        {
          name  = "APP_JWT_ALLOW_HYBRID"
          value = tostring(lower(trimspace(var.auth_mode)) == "hybrid")
        },
        {
          name  = "JWT_HMAC_SECRET_VERSION"
          value = var.jwt_hmac_secret_version_id
        },
        {
          name  = "COGNITO_ISSUER"
          value = var.cognito_issuer_url
        },
        {
          name  = "COGNITO_JWKS_URL"
          value = var.cognito_jwks_url
        },
        {
          name  = "COGNITO_AUDIENCE"
          value = var.cognito_audience
        },
        {
          name  = "AWS_COGNITO_USER_POOL_ID"
          value = var.cognito_user_pool_id
        },
        {
          name  = "AWS_COGNITO_CLIENT_ID"
          value = var.cognito_client_id
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
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
        },
        {
          name      = "SPRING_DATASOURCE_USERNAME"
          valueFrom = var.db_username_secret_arn
        },
        {
          name      = "SPRING_DATASOURCE_PASSWORD"
          valueFrom = var.db_password_secret_arn
        }
      ]
    }
    client = {
      desired_count = local.effective_desired_counts.client
      image_tag     = var.image_tags.client
      environment = [
        {
          name  = "SPRING_DATASOURCE_URL"
          value = var.db_jdbc_url
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE"
          value = "4"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE"
          value = "1"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT"
          value = "30000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT"
          value = "600000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAX_LIFETIME"
          value = "1200000"
        },
        {
          name  = "CLIENT_LOG_SERVICE_URL"
          value = var.log_api_base_url
        },
        {
          name  = "VERIFICATION_EMAIL_PROVIDER"
          value = var.verification_email_provider
        },
        {
          name  = "SES_SENDER_EMAIL"
          value = var.ses_sender_email
        },
        {
          name  = "VERIFICATION_SNS_TOPIC_ARN"
          value = var.verification_sns_topic_arn
        },
        {
          name  = "VERIFICATION_DOCUMENTS_BUCKET"
          value = var.verification_documents_bucket
        },
        {
          name  = "VERIFICATION_EMAIL_AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "AUTH_MODE"
          value = var.auth_mode
        },
        {
          name  = "APP_JWT_ALLOW_HYBRID"
          value = tostring(lower(trimspace(var.auth_mode)) == "hybrid")
        },
        {
          name  = "JWT_HMAC_SECRET_VERSION"
          value = var.jwt_hmac_secret_version_id
        },
        {
          name  = "COGNITO_ISSUER"
          value = var.cognito_issuer_url
        },
        {
          name  = "COGNITO_JWKS_URL"
          value = var.cognito_jwks_url
        },
        {
          name  = "COGNITO_AUDIENCE"
          value = var.cognito_audience
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
      desired_count = local.effective_desired_counts.transaction
      image_tag     = var.image_tags.transaction
      environment = [
        {
          name  = "CLIENT_SERVICE_URL"
          value = local.client_service_internal_url
        },
        {
          name  = "MOCK_SFTP_ROOT"
          value = var.transaction_mock_sftp_root
        },
        {
          name  = "SPRING_DATASOURCE_URL"
          value = var.db_jdbc_url
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE"
          value = "4"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE"
          value = "1"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT"
          value = "30000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT"
          value = "600000"
        },
        {
          name  = "SPRING_DATASOURCE_HIKARI_MAX_LIFETIME"
          value = "1200000"
        },
        {
          name  = "APP_TRANSACTIONS_STORE_TYPE"
          value = "postgres"
        },
        {
          name  = "TRANSACTION_IMPORT_S3_BUCKET"
          value = var.transaction_import_s3_bucket
        },
        {
          name  = "TRANSACTION_IMPORT_S3_REGION"
          value = var.transaction_import_s3_region
        },
        {
          name  = "TRANSACTION_IMPORT_S3_ENDPOINT"
          value = var.transaction_import_s3_endpoint
        },
        {
          name  = "TRANSACTION_IMPORT_S3_PATH_STYLE_ACCESS_ENABLED"
          value = tostring(var.transaction_import_s3_path_style_access_enabled)
        },
        {
          name  = "TRANSACTION_SFTP_REMOTE_DIR"
          value = var.transaction_sftp_remote_dir
        },
        {
          name  = "AUTH_MODE"
          value = var.auth_mode
        },
        {
          name  = "APP_JWT_ALLOW_HYBRID"
          value = tostring(lower(trimspace(var.auth_mode)) == "hybrid")
        },
        {
          name  = "JWT_HMAC_SECRET_VERSION"
          value = var.jwt_hmac_secret_version_id
        },
        {
          name  = "COGNITO_ISSUER"
          value = var.cognito_issuer_url
        },
        {
          name  = "COGNITO_JWKS_URL"
          value = var.cognito_jwks_url
        },
        {
          name  = "COGNITO_AUDIENCE"
          value = var.cognito_audience
        }
      ]
      secrets = [
        {
          name      = "JWT_HMAC_SECRET"
          valueFrom = var.jwt_hmac_secret_arn
        },
        {
          name      = "SPRING_DATASOURCE_USERNAME"
          valueFrom = var.db_username_secret_arn
        },
        {
          name      = "SPRING_DATASOURCE_PASSWORD"
          valueFrom = var.db_password_secret_arn
        }
      ]
    }
  }

  autoscaled_service_configs = {
    for service_name, config in local.service_configs :
    service_name => config
    if(
      local.is_production_like ||
      var.enable_stateful_service_scale_out ||
      !contains(local.in_memory_stateful_services, service_name)
    )
  }

  # CloudMap namespace for service discovery.
  # Derived from the resource attribute when discovery is on so that any change
  # to the namespace name propagates automatically rather than silently diverging.
  cloudmap_namespace_name     = var.enable_service_discovery ? aws_service_discovery_private_dns_namespace.internal[0].name : "${var.environment}.${var.project_name}.internal"
  client_service_internal_url = var.enable_service_discovery ? "http://client.${local.cloudmap_namespace_name}:8080" : "http://${var.alb_dns_name}"
}

# ECS Cluster with Container Insights enabled for monitoring
resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-ecs"

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }
}
