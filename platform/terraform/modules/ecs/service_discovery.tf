#--------------------------------------------------------------
# ECS Module - Service Discovery (AWS Cloud Map)
# This file configures private DNS namespace and service discovery
# for inter-service communication within the VPC
#--------------------------------------------------------------

# Private DNS namespace for internal service-to-service communication
resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "${var.environment}.${var.project_name}.internal"
  vpc  = var.vpc_id
}

# Service discovery services for each ECS service
# Allows services to find each other using DNS names
resource "aws_service_discovery_service" "service" {
  for_each = local.service_configs

  name = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}
