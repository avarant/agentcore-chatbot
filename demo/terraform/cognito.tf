###############################################################################
# Demo App — cognito.tf — Demo Cognito user pool for auth
###############################################################################

resource "aws_cognito_user_pool" "demo" {
  name = "${local.name_prefix}-users"

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
    Name = "${local.name_prefix}-users"
  }
}

resource "aws_cognito_user_pool_domain" "demo" {
  domain       = "${local.name_prefix}-${local.account_id}"
  user_pool_id = aws_cognito_user_pool.demo.id
}

resource "aws_cognito_user_pool_client" "demo" {
  name         = "${local.name_prefix}-client"
  user_pool_id = aws_cognito_user_pool.demo.id

  generate_secret = true

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Placeholder — updated by null_resource after CloudFront is created
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

# Update Cognito callback URLs after CloudFront domain is known
resource "null_resource" "update_cognito_urls" {
  triggers = {
    cloudfront_domain = aws_cloudfront_distribution.demo.domain_name
    client_id         = aws_cognito_user_pool_client.demo.id
  }

  provisioner "local-exec" {
    command = <<-EOF
      aws cognito-idp update-user-pool-client \
        --user-pool-id ${aws_cognito_user_pool.demo.id} \
        --client-id ${aws_cognito_user_pool_client.demo.id} \
        --callback-urls '["${local.demo_callback_url}"]' \
        --logout-urls '["${local.demo_url}"]' \
        --allowed-o-auth-flows code \
        --allowed-o-auth-scopes email openid profile \
        --supported-identity-providers COGNITO \
        --allowed-o-auth-flows-user-pool-client \
        --region ${var.aws_region}
    EOF
  }

  depends_on = [aws_cloudfront_distribution.demo]
}

locals {
  demo_url          = var.domain != "" ? "https://${var.domain}" : "https://${aws_cloudfront_distribution.demo.domain_name}"
  demo_callback_url = "${local.demo_url}/api/auth/callback"
}
