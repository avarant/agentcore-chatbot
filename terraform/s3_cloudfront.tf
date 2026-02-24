###############################################################################
# Agent77 — s3_cloudfront.tf — S3 static site + CloudFront distribution
#
# CloudFront serves:
#   - Default behavior  -> S3 (frontend SPA)
#   - /api/*            -> API Gateway (Lambda proxy)
###############################################################################

# ---------------------------------------------------------------------------
# S3 Bucket — Frontend static assets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket        = "${local.name_prefix}-frontend-${local.account_id}"
  force_destroy = false

  tags = {
    Name = "${local.name_prefix}-frontend"
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# CloudFront Origin Access Control
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${local.name_prefix}-s3-oac"
  description                       = "OAC for ${local.name_prefix} frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# S3 Bucket Policy — Allow CloudFront OAC
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} distribution"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  wait_for_deployment = true

  aliases = var.domain != "" ? [var.domain] : []

  # --- S3 Origin (frontend) ---
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # --- API Gateway Origin ---
  origin {
    domain_name = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")
    origin_id   = "api-gateway"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # --- Default behavior: S3 frontend ---
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id = null

    # SPA: return index.html for all 403/404 from S3
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # --- /api/* behavior: proxy to API Gateway ---
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-gateway"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward.id
  }

  # SPA: custom error responses return index.html
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
    # Use custom cert if domain is provided, otherwise use default CloudFront cert
    cloudfront_default_certificate = var.domain == "" ? true : false
    acm_certificate_arn            = var.domain != "" ? aws_acm_certificate.main[0].arn : null
    ssl_support_method             = var.domain != "" ? "sni-only" : null
    minimum_protocol_version       = var.domain != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  tags = {
    Name = "${local.name_prefix}-distribution"
  }
}

# ---------------------------------------------------------------------------
# CloudFront Cache Policy — Static assets (long TTL)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${local.name_prefix}-static-assets"
  comment     = "Cache static assets with long TTL"
  default_ttl = 86400    # 1 day
  max_ttl     = 31536000 # 1 year
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ---------------------------------------------------------------------------
# CloudFront Cache Policy — API (no cache)
# ---------------------------------------------------------------------------

# Use AWS managed CachingDisabled policy for API requests
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# ---------------------------------------------------------------------------
# CloudFront Origin Request Policy — Forward all to API
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_request_policy" "api_forward" {
  name    = "${local.name_prefix}-api-forward"
  comment = "Forward relevant headers and all query strings to API Gateway"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Content-Type",
        "Origin",
        "Referer",
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# ---------------------------------------------------------------------------
# CloudFront Function — SPA rewrite (serves index.html for non-file paths)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${replace(local.name_prefix, "-", "_")}_spa_rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite non-file requests to index.html for SPA routing"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      // If the URI has a file extension, serve it as-is
      if (uri.includes('.')) {
        return request;
      }

      // If the URI starts with /api, pass through (handled by ordered behavior)
      if (uri.startsWith('/api')) {
        return request;
      }

      // Append .html for static pages (e.g. /login -> /login.html)
      // If the .html file doesn't exist, S3 returns 404 which CloudFront
      // custom_error_response maps to /index.html (SPA fallback)
      if (uri === '/') {
        request.uri = '/index.html';
      } else {
        request.uri = uri + '.html';
      }
      return request;
    }
  JS
}
