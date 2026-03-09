#--------------------------------------------------------------
# ECS Module - Task Definitions and Services
# This file defines ECS task definitions and services for
# running containerized applications on Fargate
#--------------------------------------------------------------

# ECS Task Definitions - define container specifications
resource "aws_ecs_task_definition" "service" {
  for_each = local.service_configs

  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.ecs_task_cpu)
  memory                   = tostring(var.ecs_task_memory)
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arns[each.key]

  container_definitions = templatefile(local.task_definition_template, {
    container_name    = each.key
    image             = "${var.ecr_repository_url}:${each.value.image_tag}"
    container_port    = 8080
    environment_json  = jsonencode(each.value.environment)
    secrets_json      = jsonencode(each.value.secrets)
    log_group_name    = aws_cloudwatch_log_group.ecs[each.key].name
    aws_region        = var.aws_region
    healthcheck_cmd   = "wget -qO- http://localhost:8080${var.service_health_check_path} || exit 1"
    health_interval   = 30
    health_timeout    = 5
    health_retries    = 3
    health_start_time = 30
  })
}

# ECS Services - manage running tasks and integrate with ALB
resource "aws_ecs_service" "service" {
  for_each = local.service_configs

  name                               = "${var.name_prefix}-${each.key}"
  cluster                            = aws_ecs_cluster.this.id
  launch_type                        = "FARGATE"
  desired_count                      = each.value.desired_count
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # Circuit breaker for automatic rollback on failed deployments
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Network configuration for Fargate tasks
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_service_security_group_id]
    assign_public_ip = false
  }

  # Load balancer integration
  load_balancer {
    target_group_arn = var.target_group_arns[each.key]
    container_name   = each.key
    container_port   = 8080
  }

  # Service discovery registration
  service_registries {
    registry_arn   = aws_service_discovery_service.service[each.key].arn
    container_name = each.key
    container_port = 8080
  }
}

# SSM Parameter for client service internal URL
resource "aws_ssm_parameter" "client_service_url" {
  name  = "/${var.project_name}/${var.environment}/service/client/internal_url"
  type  = "String"
  value = local.client_service_internal_url
}
