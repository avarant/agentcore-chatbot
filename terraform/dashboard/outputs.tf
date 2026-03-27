###############################################################################
# AgentCore Chatbot — Dashboard stack outputs
###############################################################################

output "dashboard_api_url" {
  description = "Dashboard API URL (Lambda Function URL, direct access)"
  value       = aws_lambda_function_url.dashboard.function_url
}

output "dashboard_url" {
  description = "Dashboard URL (CloudFront)"
  value       = var.enable_dashboard_ui ? "https://${aws_cloudfront_distribution.dashboard[0].domain_name}" : ""
}

output "dashboard_cognito_user_pool_id" {
  description = "Dashboard Cognito user pool ID"
  value       = var.enable_dashboard_ui ? aws_cognito_user_pool.dashboard[0].id : ""
}

output "dashboard_cognito_client_id" {
  description = "Dashboard Cognito client ID"
  value       = var.enable_dashboard_ui ? aws_cognito_user_pool_client.dashboard[0].id : ""
}

output "dashboard_cognito_domain" {
  description = "Dashboard Cognito hosted UI domain"
  value       = var.enable_dashboard_ui ? "https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""
}

output "dashboard_oidc_discovery_url" {
  description = "Cognito OIDC discovery URL (use this as oidc_discovery_url in agent stacks if you want widget users to authenticate via this dashboard's Cognito)"
  value       = var.enable_dashboard_ui ? "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.dashboard[0].id}/.well-known/openid-configuration" : ""
}

output "deploy_frontend_command" {
  description = "Command to deploy dashboard frontend to S3 and invalidate CloudFront"
  value       = var.enable_dashboard_ui ? "aws s3 sync ./apps/web/out s3://${aws_s3_bucket.dashboard[0].id} --delete && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.dashboard[0].id} --paths '/*'" : ""
}

output "deploy_lambda_command" {
  description = "Command to update dashboard Lambda code"
  value       = "cd apps/api && pnpm build && cd ../.. && cd terraform/dashboard && terraform apply -target=aws_lambda_function.dashboard -auto-approve"
}
