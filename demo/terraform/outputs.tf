###############################################################################
# Demo App — outputs.tf
###############################################################################

output "demo_url" {
  description = "Demo site URL"
  value       = local.demo_url
}

output "oidc_discovery_url" {
  description = "OIDC discovery URL — pass this to the main stack's oidc_discovery_url variable"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.demo.id}/.well-known/openid-configuration"
}

output "cognito_client_id" {
  description = "Cognito client ID — pass this to the main stack's oidc_allowed_audience variable"
  value       = aws_cognito_user_pool_client.demo.id
}

output "cognito_user_pool_id" {
  description = "Demo Cognito User Pool ID"
  value       = aws_cognito_user_pool.demo.id
}

output "cognito_login_url" {
  description = "Cognito hosted UI login URL for the demo"
  value       = "https://${aws_cognito_user_pool_domain.demo.domain}.auth.${var.aws_region}.amazoncognito.com/login?client_id=${aws_cognito_user_pool_client.demo.id}&response_type=code&scope=email+openid+profile&redirect_uri=${urlencode(local.demo_callback_url)}"
}

output "s3_bucket_name" {
  description = "S3 bucket for demo static assets"
  value       = aws_s3_bucket.demo.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = aws_cloudfront_distribution.demo.id
}

output "lambda_function_name" {
  description = "Demo API Lambda function name"
  value       = aws_lambda_function.demo.function_name
}
