#--------------------------------------------------------------
# ACM Module - Outputs
#--------------------------------------------------------------

output "frontend_certificate_arn" {
  description = "ACM cert ARN for CloudFront (us-east-1)."
  value       = aws_acm_certificate.us_cert.arn
}

output "alb_certificate_arn" {
  description = "ACM cert ARN for ALB (primary region)."
  value       = aws_acm_certificate.ap_cert.arn
}

output "alb_origin_domain_name" {
  description = "ALB origin domain name."
  value       = "${var.alb_origin_subdomain}.${var.app_domain_name}"
}

output "us_certificate_validation_id" {
  description = "ID of the us-east-1 certificate validation."
  value       = aws_acm_certificate_validation.us_cert_validation.id
}

output "ap_certificate_validation_id" {
  description = "ID of the ap-southeast-1 certificate validation."
  value       = aws_acm_certificate_validation.ap_cert_validation.id
}
