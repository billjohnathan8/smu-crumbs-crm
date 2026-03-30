#--------------------------------------------------------------
# Security Module - AWS GuardDuty
# Intelligent threat detection service that continuously monitors
# for malicious activity and unauthorized behavior
#--------------------------------------------------------------

resource "aws_guardduty_detector" "main" {
  count = var.enable_guardduty ? 1 : 0

  enable                       = true
  finding_publishing_frequency = var.guardduty_finding_frequency

  # Monitor ECS containers, Lambda functions, and runtime behavior
  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = false # Set to true if using EKS
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = false # Not applicable for Fargate-only workloads
        }
      }
    }
  }

  tags = {
    Name = "${var.name_prefix}-guardduty"
  }
}

# CloudWatch Event Rule to forward GuardDuty findings to SNS
resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  count = var.enable_guardduty && var.guardduty_notification_enabled ? 1 : 0

  name        = "${var.name_prefix}-guardduty-findings"
  description = "Capture GuardDuty findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
  })
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  count = var.enable_guardduty && var.guardduty_notification_enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.guardduty_findings[0].name
  target_id = "SendToSNS"
  arn       = var.guardduty_notification_topic_arn
}

# Optional: Filter only HIGH and CRITICAL severity findings
resource "aws_cloudwatch_event_rule" "guardduty_high_severity" {
  count = var.enable_guardduty && var.guardduty_notification_enabled && var.guardduty_high_severity_only ? 1 : 0

  name        = "${var.name_prefix}-guardduty-high-severity"
  description = "Capture only HIGH and CRITICAL GuardDuty findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [7, 7.0, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8, 8.0, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9]
    }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_high_severity_sns" {
  count = var.enable_guardduty && var.guardduty_notification_enabled && var.guardduty_high_severity_only ? 1 : 0

  rule      = aws_cloudwatch_event_rule.guardduty_high_severity[0].name
  target_id = "SendToSNS"
  arn       = var.guardduty_notification_topic_arn
}

# SNS topic policy to allow EventBridge to publish
resource "aws_sns_topic_policy" "guardduty_publish" {
  count = var.enable_guardduty && var.guardduty_notification_enabled ? 1 : 0

  arn = var.guardduty_notification_topic_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "events.amazonaws.com"
      }
      Action   = "SNS:Publish"
      Resource = var.guardduty_notification_topic_arn
    }]
  })
}
