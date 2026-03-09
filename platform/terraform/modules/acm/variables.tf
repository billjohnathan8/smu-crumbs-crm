#--------------------------------------------------------------
# ACM Module - Variables
#--------------------------------------------------------------

variable "name_prefix" {
  description = "Global naming prefix for resource tags."
  type        = string
}

variable "app_domain_name" {
  description = "Base domain for the certificate (e.g., itsag2t3.com)."
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 zone ID where DNS validation records will be created."
  type        = string
}

variable "alb_origin_subdomain" {
  description = "Subdomain for ALB origin (e.g., 'api' for api.yourdomain.com)."
  type        = string
  default     = "api"
}
