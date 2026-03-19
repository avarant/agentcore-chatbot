###############################################################################
# Agent77 — Dashboard stack — Cognito + S3 + CloudFront for dashboard UI
###############################################################################

# ---------------------------------------------------------------------------
# Cognito — User Pool + Domain + Client
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool" "dashboard" {
  count = local.enable_dashboard_ui

  name = "${local.name_prefix}-dashboard-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Name = "${local.name_prefix}-dashboard-users"
  }
}

resource "aws_cognito_user_pool_domain" "dashboard" {
  count = local.enable_dashboard_ui

  domain       = "${local.name_prefix}-dashboard-${local.account_id}"
  user_pool_id = aws_cognito_user_pool.dashboard[0].id
}

resource "aws_cognito_user_pool_client" "dashboard" {
  count = local.enable_dashboard_ui

  name         = "${local.name_prefix}-dashboard-client"
  user_pool_id = aws_cognito_user_pool.dashboard[0].id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Placeholder — updated by terraform_data below after CloudFront is created.
  callback_urls = ["https://localhost/api/auth/callback"]
  logout_urls   = ["https://localhost"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  lifecycle {
    ignore_changes = [callback_urls, logout_urls]
  }
}

# Update Cognito callback URLs after CloudFront domain is known.
resource "terraform_data" "update_dashboard_cognito_urls" {
  count = local.enable_dashboard_ui

  triggers_replace = [
    aws_cloudfront_distribution.dashboard[0].domain_name,
    aws_cognito_user_pool_client.dashboard[0].id,
  ]

  provisioner "local-exec" {
    command = <<-EOF
      aws cognito-idp update-user-pool-client \
        --user-pool-id ${aws_cognito_user_pool.dashboard[0].id} \
        --client-id ${aws_cognito_user_pool_client.dashboard[0].id} \
        --callback-urls '["https://${aws_cloudfront_distribution.dashboard[0].domain_name}/api/auth/callback"]' \
        --logout-urls '["https://${aws_cloudfront_distribution.dashboard[0].domain_name}"]' \
        --allowed-o-auth-flows code \
        --allowed-o-auth-scopes email openid profile \
        --supported-identity-providers COGNITO \
        --allowed-o-auth-flows-user-pool-client \
        --explicit-auth-flows ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH ALLOW_USER_PASSWORD_AUTH \
        --region ${var.aws_region}
    EOF
  }

  depends_on = [aws_cloudfront_distribution.dashboard]
}

# ---------------------------------------------------------------------------
# S3 Bucket — dashboard static assets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "dashboard" {
  count = local.enable_dashboard_ui

  bucket        = "${local.name_prefix}-dashboard-${local.account_id}"
  force_destroy = true

  tags = {
    Name = "${local.name_prefix}-dashboard"
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  count = local.enable_dashboard_ui

  bucket = aws_s3_bucket.dashboard[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# CloudFront OAC — grants CloudFront access to S3
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "dashboard" {
  count = local.enable_dashboard_ui

  name                              = "${local.name_prefix}-dashboard"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "dashboard" {
  count = local.enable_dashboard_ui

  bucket = aws_s3_bucket.dashboard[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudFrontReadAccess"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.dashboard[0].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.dashboard[0].arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CloudFront Distribution — dashboard UI + API proxy
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "dashboard" {
  count = local.enable_dashboard_ui

  enabled             = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} dashboard"
  price_class         = "PriceClass_100"

  # S3 origin — static assets
  origin {
    domain_name              = aws_s3_bucket.dashboard[0].bucket_regional_domain_name
    origin_id                = "s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard[0].id
  }

  # Lambda Function URL origin — API routes
  origin {
    domain_name = replace(replace(aws_lambda_function_url.dashboard.function_url, "https://", ""), "/", "")
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # /api/* → Lambda
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "X-API-Key", "X-Forwarded-Host"]

      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.dashboard_api_host[0].arn
    }
  }

  # Default — S3
  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.dashboard_spa_rewrite[0].arn
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${local.name_prefix}-dashboard"
  }
}

# ---------------------------------------------------------------------------
# CloudFront Function — Copy Host to X-Forwarded-Host for API routes
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "dashboard_api_host" {
  count = local.enable_dashboard_ui

  name    = "${replace(local.name_prefix, "-", "_")}_dashboard_api_host"
  runtime = "cloudfront-js-2.0"
  comment = "Copy viewer Host to X-Forwarded-Host so Lambda can derive the dashboard URL"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      request.headers['x-forwarded-host'] = { value: request.headers.host.value };
      return request;
    }
  JS
}

# ---------------------------------------------------------------------------
# CloudFront Function — SPA rewrite
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "dashboard_spa_rewrite" {
  count = local.enable_dashboard_ui

  name    = "${replace(local.name_prefix, "-", "_")}_dashboard_spa_rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite non-file requests to .html for SPA routing"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      if (uri.includes('.')) {
        return request;
      }

      if (uri.startsWith('/api')) {
        return request;
      }

      if (uri === '/') {
        request.uri = '/index.html';
      } else {
        request.uri = uri + '.html';
      }
      return request;
    }
  JS
}
