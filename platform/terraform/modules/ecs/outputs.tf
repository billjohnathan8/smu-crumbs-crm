#--------------------------------------------------------------
# ECS Module - Outputs
#--------------------------------------------------------------

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "cloudmap_namespace_name" {
  description = "Cloud Map private DNS namespace name."
  value       = local.cloudmap_namespace_name
}

output "client_service_internal_url" {
  description = "Client service internal URL resolved via Cloud Map."
  value       = local.client_service_internal_url
}
