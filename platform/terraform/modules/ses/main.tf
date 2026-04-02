#--------------------------------------------------------------
# SES Module - Amazon Simple Email Service
# This module manages SES for sending transactional emails
# Supports both email identity verification and domain-based setup
# with DKIM, SPF, and custom MAIL FROM configuration
#--------------------------------------------------------------
locals {
  notification_identity = var.domain != "" ? var.domain : var.sender_email
  manage_domain_dns     = var.enable_ses && var.domain != "" && var.manage_dns_records && trimspace(var.route53_zone_id) != ""
}

# SES Email Identity Verification (Fallback Method)
# Used when a full domain setup is not available
# Requires email verification via AWS console or confirmation link
resource "aws_ses_email_identity" "verification" {
  count = var.enable_ses && var.sender_email != "" && var.domain == "" ? 1 : 0

  email = var.sender_email
}

# SES Domain Identity
# Verifies entire domain for sending emails from any address @domain
# Preferred over individual email verification for production use
resource "aws_ses_domain_identity" "this" {
  count = var.domain != "" ? 1 : 0

  domain = var.domain
}

resource "aws_route53_record" "ses_domain_verification" {
  count = local.manage_domain_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "_amazonses.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this[0].verification_token]
}

# DKIM (DomainKeys Identified Mail) Configuration
# Cryptographic authentication to prove email authenticity
# Improves email deliverability and reduces spam classification
# Generates 3 CNAME tokens that must be added to DNS
resource "aws_ses_domain_dkim" "this" {
  count = var.domain != "" ? 1 : 0

  domain = aws_ses_domain_identity.this[0].domain
}

resource "aws_route53_record" "ses_domain_dkim" {
  for_each = local.manage_domain_dns ? {
    # SES always yields 3 DKIM tokens; keep keys static so plan can evaluate for_each.
    for i in range(3) : tostring(i) => i
  } : {}

  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.this[0].dkim_tokens[each.value]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this[0].dkim_tokens[each.value]}.dkim.amazonses.com"]
}

# Custom MAIL FROM Domain
# Sets up a custom MAIL FROM domain instead of amazonses.com
# Improves SPF alignment and reduces Gmail warning messages
# Requires MX and TXT (SPF) records in DNS:
# - MX: {mail_from_domain} -> 10 feedback-smtp.{region}.amazonses.com
# - TXT: {mail_from_domain} -> v=spf1 include:amazonses.com ~all
resource "aws_ses_domain_mail_from" "this" {
  count = var.domain != "" ? 1 : 0

  domain           = aws_ses_domain_identity.this[0].domain
  mail_from_domain = "${var.mail_from_subdomain}.${var.domain}"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count = local.manage_domain_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "${var.mail_from_subdomain}.${var.domain}"
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count = local.manage_domain_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "${var.mail_from_subdomain}.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_ses_identity_notification_topic" "events" {
  for_each = (
    var.enable_ses &&
    var.enable_notification_topics &&
    local.notification_identity != ""
  ) ? toset(["Bounce", "Complaint", "Delivery"]) : toset([])

  identity          = local.notification_identity
  notification_type = each.value
  topic_arn         = var.notification_topic_arn
}
