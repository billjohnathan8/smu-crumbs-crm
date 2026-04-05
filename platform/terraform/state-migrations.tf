#--------------------------------------------------------------
# Terraform state migrations
#--------------------------------------------------------------
# This file contains temporary state-transition metadata.
#
# Fresh account / fresh state behavior:
# - `removed` blocks are no-ops when the address never existed in state.
# - Keeping this file does not block provisioning in a brand-new AWS account.
#
# Cleanup policy:
# - After all long-lived states have applied at least once with this migration
#   and no state still contains the legacy address, this block can be removed.

# GuardDuty publish permissions are now assembled in module.sns
# alarm topic policy. Keep the remote topic policy untouched while
# removing this standalone state entry.
removed {
  from = module.security.aws_sns_topic_policy.guardduty_publish

  lifecycle {
    destroy = false
  }
}
