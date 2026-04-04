#--------------------------------------------------------------
# API Gateway Module
# HTTP API fronting the log service Lambda, served through CloudFront.
#--------------------------------------------------------------

locals {
  log_api_route_keys = toset([
    "GET /health",
    "GET /api/v1/health",
    "GET /api/v1/logs/health",
    "GET /api/logs",
    "POST /api/logs",
    "GET /api/logs/{logId}",
    "PUT /api/logs/{logId}",
    "DELETE /api/logs/{logId}",
    "GET /api/clients/{clientId}/logs",
    "GET /api/aml/alerts",
    "POST /api/aml/alerts",
    "GET /api/aml/alerts/{alertId}",
    "PUT /api/aml/alerts/{alertId}/review",
    "POST /api/aml/trigger",
    "POST /api/communications",
    "GET /api/communications",
    "GET /api/communications/queued",
    "GET /api/communications/{communicationId}",
    "PATCH /api/communications/{communicationId}/status",
    "PATCH /api/communications/provider/{providerMessageId}/status",
    "GET /api/clients/{clientId}/communications",
  ])

  allowed_cors_origins = compact([
    var.use_custom_domain ? "https://${var.app_domain_name}" : "",
    var.cloudfront_domain_name != "" ? "https://${var.cloudfront_domain_name}" : "",
  ])
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "log" {
  name          = "${var.name_prefix}-log-http-api"
  protocol_type = "HTTP"

  dynamic "cors_configuration" {
    for_each = length(local.allowed_cors_origins) > 0 ? [1] : []
    content {
      allow_origins = local.allowed_cors_origins
      allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
      allow_headers = ["*"]
      max_age       = 300
    }
  }
}

resource "aws_apigatewayv2_integration" "log_lambda" {
  api_id                 = aws_apigatewayv2_api.log.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.log_lambda_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "log" {
  for_each = local.log_api_route_keys

  api_id    = aws_apigatewayv2_api.log.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.log_lambda.id}"
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.name_prefix}-log-http-api"
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_apigatewayv2_stage" "log_default" {
  api_id      = aws_apigatewayv2_api.log.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      sourceIp         = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_lambda_permission" "allow_api_gateway_invoke_log" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = var.log_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.log.id}/*/*"
}

resource "aws_ssm_parameter" "log_service_url" {
  name  = "/${var.project_name}/${var.environment}/service/log/url"
  type  = "String"
  value = aws_apigatewayv2_api.log.api_endpoint
}
