###############################################################################
# AgentCore Chatbot — widget.tf — S3 + CloudFront CDN for embeddable widget
###############################################################################

# ---------------------------------------------------------------------------
# S3 Bucket — widget assets
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "widget" {
  count = var.enable_agentcore ? 1 : 0

  bucket        = "${local.name_prefix}-widget-${local.account_id}"
  force_destroy = true

  tags = {
    Name = "${local.name_prefix}-widget"
  }
}

resource "aws_s3_bucket_public_access_block" "widget" {
  count = var.enable_agentcore ? 1 : 0

  bucket = aws_s3_bucket.widget[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# CloudFront OAC — grants CloudFront access to S3
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "widget" {
  count = var.enable_agentcore ? 1 : 0

  name                              = "${local.name_prefix}-widget"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "widget" {
  count = var.enable_agentcore ? 1 : 0

  bucket = aws_s3_bucket.widget[0].id

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
        Resource = "${aws_s3_bucket.widget[0].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.widget[0].arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CloudFront Distribution — widget CDN
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "widget" {
  count = var.enable_agentcore ? 1 : 0

  enabled     = true
  comment     = "${local.name_prefix} widget CDN"
  price_class = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.widget[0].bucket_regional_domain_name
    origin_id                = "s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.widget[0].id
  }

  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000

    # CORS headers for cross-origin widget loading
    response_headers_policy_id = aws_cloudfront_response_headers_policy.widget[0].id
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
    Name = "${local.name_prefix}-widget-cdn"
  }
}

# ---------------------------------------------------------------------------
# Response Headers Policy — CORS for cross-origin embedding
# ---------------------------------------------------------------------------

resource "aws_cloudfront_response_headers_policy" "widget" {
  count = var.enable_agentcore ? 1 : 0

  name    = "${replace(local.name_prefix, "-", "_")}_widget_cors"
  comment = "CORS headers for widget CDN"

  cors_config {
    access_control_allow_origins {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD"]
    }

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_credentials = false
    access_control_max_age_sec       = 86400
    origin_override                  = true
  }
}
