#--------------------------------------------------------------
# Route53 DNS Configuration for ACM Certificate Validation
# Creates DNS records needed to validate ACM certificates.
#--------------------------------------------------------------

locals {
  us_validation_domains = toset([
    var.app_domain_name,
    "*.${var.app_domain_name}",
  ])

  ap_validation_domains = toset([
    var.app_domain_name,
    "*.${var.app_domain_name}",
    "${var.alb_origin_subdomain}.${var.app_domain_name}",
  ])

  us_dvo_by_domain = {
    for dvo in aws_acm_certificate.us_cert.domain_validation_options : dvo.domain_name => dvo
  }

  ap_dvo_by_domain = {
    for dvo in aws_acm_certificate.ap_cert.domain_validation_options : dvo.domain_name => dvo
  }
}

#--------------------------------------------------------------
# US East Region Certificate Validation Records
# DNS records required to validate the CloudFront certificate.
#--------------------------------------------------------------
resource "aws_route53_record" "us_cert_validation" {
  for_each = var.manage_dns_validation_records ? {
    for domain_name in local.us_validation_domains : domain_name => domain_name
  } : {}

  allow_overwrite = true
  name            = local.us_dvo_by_domain[each.key].resource_record_name
  records         = [local.us_dvo_by_domain[each.key].resource_record_value]
  ttl             = 60
  type            = local.us_dvo_by_domain[each.key].resource_record_type
  zone_id         = var.route53_zone_id
}

#--------------------------------------------------------------
# AP Southeast Region Certificate Validation Records
# DNS records required to validate the ALB certificate.
#--------------------------------------------------------------
resource "aws_route53_record" "ap_cert_validation" {
  for_each = var.manage_dns_validation_records ? {
    for domain_name in local.ap_validation_domains : domain_name => domain_name
  } : {}

  allow_overwrite = true
  name            = local.ap_dvo_by_domain[each.key].resource_record_name
  records         = [local.ap_dvo_by_domain[each.key].resource_record_value]
  ttl             = 60
  type            = local.ap_dvo_by_domain[each.key].resource_record_type
  zone_id         = var.route53_zone_id
}
