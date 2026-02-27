###############################################################################
# Demo App — s3_cloudfront.tf — S3 + CloudFront for dashboard + Lambda URL
###############################################################################

# ---------------------------------------------------------------------------
# S3 Bucket — static assets (Next.js export + widget)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "demo" {
  bucket        = "${local.name_prefix}-site-${local.account_id}"
  force_destroy = true

  tags = {
    Name = "${local.name_prefix}-site"
  }
}

resource "aws_s3_bucket_public_access_block" "demo" {
  bucket = aws_s3_bucket.demo.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_identity" "demo" {
  comment = "${local.name_prefix} OAI"
}

resource "aws_s3_bucket_policy" "demo" {
  bucket = aws_s3_bucket.demo.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudFrontReadAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.demo.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.demo.arn}/*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "demo" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # S3 origin — static assets
  origin {
    domain_name = aws_s3_bucket.demo.bucket_regional_domain_name
    origin_id   = "s3"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.demo.cloudfront_access_identity_path
    }
  }

  # Lambda Function URL origin — API routes
  origin {
    domain_name = replace(replace(aws_lambda_function_url.demo.function_url, "https://", ""), "/", "")
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
      headers      = ["Authorization", "Origin"]

      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
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

    # SPA: rewrite non-file paths to .html (e.g. /dashboard -> /dashboard.html)
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # SPA routing: return index.html for 403/404 from S3
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
    Name = "${local.name_prefix}-distribution"
  }
}

# ---------------------------------------------------------------------------
# CloudFront Function — SPA rewrite (serves .html for non-file paths)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${replace(local.name_prefix, "-", "_")}_spa_rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite non-file requests to .html for SPA routing"
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

      // Append .html for static pages (e.g. /dashboard -> /dashboard.html)
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
