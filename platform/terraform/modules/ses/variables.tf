#--------------------------------------------------------------
# SES Module - Variables
#--------------------------------------------------------------

variable "enable_ses" {
  description = "Enable SES email identity and domain configuration."
  type        = bool
  default     = false
}

variable "sender_email" {
  description = "SES verified sender email for email identity verification. Leave empty to skip."
  type        = string
  default     = ""
}

variable "domain" {
  description = "Domain for SES domain identity with DKIM/SPF. Leave empty to use email identity instead."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region used for SES MAIL FROM MX record targets."
  type        = string
  default     = "ap-southeast-1"
}

variable "mail_from_subdomain" {
  description = "Subdomain prefix for custom MAIL FROM domain (e.g. 'mail' creates mail.example.com)."
  type        = string
  default     = "mail"
}

variable "manage_dns_records" {
  description = "Whether this module should create Route53 DNS records for SES domain verification and DKIM."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID where SES verification/DKIM/MAIL FROM records are created."
  type        = string
  default     = ""
}

variable "notification_topic_arn" {
  description = "SNS topic ARN for SES bounce/complaint/delivery notifications."
  type        = string
  default     = ""
}

variable "enable_notification_topics" {
  description = "Whether to create SES identity notification topic bindings."
  type        = bool
  default     = false
}
