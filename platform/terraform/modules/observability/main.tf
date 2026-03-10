#--------------------------------------------------------------
# Observability Module
# CloudTrail, CloudWatch alarms, and SNS alerting for
# infrastructure monitoring and compliance audit trails.
#--------------------------------------------------------------

data "aws_caller_identity" "current" {}

# --- CloudTrail ---

resource "aws_s3_bucket" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket        = "${var.name_prefix}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.cloudtrail_bucket_force_destroy

  tags = {
    Name = "${var.name_prefix}-cloudtrail"
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail[0].arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
    ]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket                  = aws_s3_bucket.cloudtrail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudtrail" "this" {
  count = var.enable_cloudtrail ? 1 : 0

  name                          = "${var.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  include_global_service_events = true
  is_multi_region_trail         = false
  enable_logging                = true

  tags = {
    Name = "${var.name_prefix}-trail"
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# --- CloudWatch Alarms ---

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  for_each = var.enable_ecs_alarms ? var.ecs_service_names : toset([])

  alarm_name          = "${var.name_prefix}-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = var.ecs_cpu_alarm_threshold
  alarm_description   = "ECS ${each.key} CPU utilization above ${var.ecs_cpu_alarm_threshold}%"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = "${var.name_prefix}-${each.key}"
  }

  tags = {
    Name = "${var.name_prefix}-${each.key}-cpu-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  count = var.enable_rds_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_cpu_alarm_threshold
  alarm_description   = "RDS CPU utilization above ${var.rds_cpu_alarm_threshold}%"

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_identifier
  }

  tags = {
    Name = "${var.name_prefix}-rds-cpu-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  count = var.enable_rds_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_free_storage_threshold_bytes
  alarm_description   = "RDS free storage below threshold"

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_identifier
  }

  tags = {
    Name = "${var.name_prefix}-rds-low-storage"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count = var.enable_alb_alarms ? 1 : 0

  alarm_name          = "${var.name_prefix}-alb-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.alb_5xx_alarm_threshold
  alarm_description   = "ALB 5XX errors above threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = {
    Name = "${var.name_prefix}-alb-5xx-high"
  }
}
