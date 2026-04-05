#--------------------------------------------------------------
# Terraform state migrations
#--------------------------------------------------------------

# GuardDuty publish permissions are now assembled in module.sns
# alarm topic policy. Keep the remote topic policy untouched while
# removing this standalone state entry.
removed {
  from = module.security.aws_sns_topic_policy.guardduty_publish

  lifecycle {
    destroy = false
  }
}
