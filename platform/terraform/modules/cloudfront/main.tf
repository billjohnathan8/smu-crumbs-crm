#--------------------------------------------------------------
# CloudFront Module
# CloudFront distribution serving the React SPA frontend from S3
# with ALB and API Gateway origins for backend routing.
#--------------------------------------------------------------

# AWS managed CloudFront policy IDs — hardcoded to avoid cloudfront:List* API calls
# that are blocked by the LabRole SCP. These IDs are global constants in all AWS accounts.
locals {
  cf_cache_policy_caching_optimized               = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cf_cache_policy_caching_disabled                = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  cf_origin_request_policy_all_viewer             = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  cf_origin_request_policy_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

locals {
  log_api_path_patterns = toset([
    "/api/logs*",
    "/api/communications*",
    "/api/aml*",
    "/api/v1/logs*",
    "/api/clients/*/logs*",
    "/api/clients/*/communications*",
  ])
}

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${var.name_prefix}-security-headers"
  comment = "Security headers for frontend document/static responses."

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.amazoncognito.com https://*.auth.ap-southeast-1.amazoncognito.com; frame-ancestors 'none';"
      override                = true
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "api_security_headers" {
  name    = "${var.name_prefix}-api-security-headers"
  comment = "Security headers for API responses (without frame/CSP document restrictions)."

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count = var.enable_cloudfront_oac ? 1 : 0

  name                              = "${var.name_prefix}-frontend-oac"
  description                       = "CloudFront access control for frontend S3 bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  aliases             = var.use_custom_domain ? [var.app_domain_name] : []
  web_acl_id          = var.waf_arn

  origin {
    domain_name              = var.frontend_bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_path              = trimspace(var.frontend_origin_path)
    origin_access_control_id = var.enable_cloudfront_oac ? aws_cloudfront_origin_access_control.frontend[0].id : null

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  origin {
    domain_name = var.use_custom_domain ? var.alb_origin_domain_name : var.alb_dns_name
    origin_id   = "backend-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.use_custom_domain ? "https-only" : "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  dynamic "origin" {
    for_each = var.enable_log_api_origin ? [1] : []
    content {
      domain_name = var.log_api_origin_domain_name
      origin_id   = "log-api-gateway"

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id           = "frontend-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = local.cf_cache_policy_caching_optimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.enable_log_api_origin ? local.log_api_path_patterns : toset([])
    content {
      path_pattern               = ordered_cache_behavior.value
      target_origin_id           = "log-api-gateway"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
      cached_methods             = ["GET", "HEAD", "OPTIONS"]
      compress                   = true
      cache_policy_id            = local.cf_cache_policy_caching_disabled
      origin_request_policy_id   = local.cf_origin_request_policy_all_viewer_except_host
      response_headers_policy_id = aws_cloudfront_response_headers_policy.api_security_headers.id
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "backend-alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = local.cf_cache_policy_caching_disabled
    origin_request_policy_id   = local.cf_origin_request_policy_all_viewer
    response_headers_policy_id = aws_cloudfront_response_headers_policy.api_security_headers.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.use_custom_domain ? false : true
    acm_certificate_arn            = var.use_custom_domain ? var.frontend_certificate_arn : null
    ssl_support_method             = var.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

locals {
  frontend_bucket_policy_statement = merge(
    {
      Sid    = "AllowCloudFrontRead"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action = ["s3:GetObject"]
      Resource = [
        "${var.frontend_bucket_arn}/*",
      ]
    },
    var.enable_cloudfront_oac ? {
      # OAC signs requests so S3 can verify SourceArn. Without OAC (Learner Lab),
      # CloudFront doesn't sign requests so this condition must be omitted.
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    } : {}
  )

  frontend_bucket_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = [local.frontend_bucket_policy_statement]
  })
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = var.frontend_bucket_id
  policy = local.frontend_bucket_policy_json
}
