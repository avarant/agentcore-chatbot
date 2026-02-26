###############################################################################
# Agent77 — outputs.tf
###############################################################################

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------

output "dashboard_url" {
  description = "URL for the Agent77 dashboard"
  value       = var.domain != "" ? "https://${var.domain}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "api_url" {
  description = "URL for the Agent77 API (via CloudFront)"
  value       = var.domain != "" ? "https://${var.domain}/api" : "https://${aws_cloudfront_distribution.main.domain_name}/api"
}

output "api_gateway_url" {
  description = "Direct API Gateway URL (bypass CloudFront)"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "snippet_url" {
  description = "URL for the embeddable chat snippet JS"
  value       = local.snippet_url
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (use for cache invalidation)"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID"
  value       = aws_cognito_user_pool_client.dashboard.id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_login_url" {
  description = "Full Cognito hosted UI login URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/login?client_id=${aws_cognito_user_pool_client.dashboard.id}&response_type=code&scope=email+openid+profile&redirect_uri=${local.cognito_callback_url}"
}

# ---------------------------------------------------------------------------
# DynamoDB
# ---------------------------------------------------------------------------

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.config.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.config.arn
}

# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------

output "frontend_bucket_name" {
  description = "S3 bucket name for frontend assets"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "S3 bucket ARN for frontend assets"
  value       = aws_s3_bucket.frontend.arn
}

# ---------------------------------------------------------------------------
# AgentCore
# ---------------------------------------------------------------------------

output "agent_runtime_id" {
  description = "AgentCore runtime ID"
  value       = local.agentcore_runtime_id
}

output "agent_runtime_arn" {
  description = "AgentCore runtime ARN"
  value       = local.agentcore_runtime_arn
}

output "agentcore_runtime_url" {
  description = "AgentCore runtime invoke URL (direct HTTP)"
  value       = var.enable_agentcore ? "https://bedrock-agentcore.${var.aws_region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_arn)}/invocations" : ""
}

output "agentcore_memory_id" {
  description = "AgentCore Memory ID"
  value       = var.enable_agentcore ? aws_bedrockagentcore_memory.main[0].id : ""
}

output "ecr_repository_url" {
  description = "ECR repository URL for agent container image"
  value       = var.enable_agentcore ? aws_ecr_repository.agent[0].repository_url : ""
}

output "codebuild_project_name" {
  description = "CodeBuild project name for agent image builds"
  value       = var.enable_agentcore ? aws_codebuild_project.agent[0].name : ""
}

# ---------------------------------------------------------------------------
# Lambda
# ---------------------------------------------------------------------------

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

# ---------------------------------------------------------------------------
# Deployment helpers
# ---------------------------------------------------------------------------

output "deploy_frontend_command" {
  description = "Command to deploy frontend assets to S3 and invalidate CloudFront"
  value       = "aws s3 sync ./apps/web/out s3://${aws_s3_bucket.frontend.id} --delete && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.main.id} --paths '/*'"
}

output "deploy_lambda_command" {
  description = "Command to update the Lambda function code"
  value       = "aws lambda update-function-code --function-name ${aws_lambda_function.api.function_name} --zip-file fileb://apps/api/dist/lambda.zip"
}
