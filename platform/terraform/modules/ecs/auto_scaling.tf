#--------------------------------------------------------------
# ECS Module - Auto Scaling
# This file configures Application Auto Scaling for ECS services
# Based on CPU and memory utilization metrics
# Non-production-like environments can exclude in-memory stateful services from
# autoscaling when enable_stateful_service_scale_out=false.
# Production-like environments always include core services to preserve HA.
# For stateful services, enable_stateful_service_scale_out controls expansion
# beyond the HA floor (2 tasks) to limit risk.
#--------------------------------------------------------------

# Auto Scaling targets - define scalable resource
resource "aws_appautoscaling_target" "service" {
  for_each = local.autoscaled_service_configs

  max_capacity = (
    contains(local.in_memory_stateful_services, each.key) && !var.enable_stateful_service_scale_out
    ) ? local.critical_ha_task_floor : (
    local.is_production_like && contains(local.critical_customer_facing_services, each.key)
  ) ? max(var.ecs_max_capacity, local.critical_ha_task_floor) : var.ecs_max_capacity
  min_capacity = (
    contains(local.in_memory_stateful_services, each.key) && !var.enable_stateful_service_scale_out
    ) ? local.critical_ha_task_floor : (
    local.is_production_like && contains(local.critical_customer_facing_services, each.key)
  ) ? max(var.ecs_min_capacity, local.critical_ha_task_floor) : var.ecs_min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${local.ecs_services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based auto scaling policy
# Scales out when CPU utilization exceeds target threshold
resource "aws_appautoscaling_policy" "cpu" {
  for_each = local.autoscaled_service_configs

  name               = "${var.name_prefix}-${each.key}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.ecs_target_cpu_utilization
  }
}

# Memory-based auto scaling policy
# Scales out when memory utilization exceeds target threshold
resource "aws_appautoscaling_policy" "memory" {
  for_each = local.autoscaled_service_configs

  name               = "${var.name_prefix}-${each.key}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = var.ecs_target_memory_utilization
  }
}
