###############################################################################
# Agent77 — outputs.tf (AgentCore-only)
###############################################################################

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

output "widget_url" {
  description = "Widget CDN URL"
  value       = var.enable_agentcore ? "https://${aws_cloudfront_distribution.widget[0].domain_name}/widget.js" : ""
}

output "widget_bucket_name" {
  description = "S3 bucket for widget assets"
  value       = var.enable_agentcore ? aws_s3_bucket.widget[0].id : ""
}

output "widget_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for widget CDN"
  value       = var.enable_agentcore ? aws_cloudfront_distribution.widget[0].id : ""
}

output "agent_prompt_id" {
  description = "Bedrock Prompt ID for the agent system prompt"
  value       = var.enable_agentcore ? aws_bedrockagent_prompt.system[0].id : ""
}

output "agent_prompt_arn" {
  description = "Bedrock Prompt ARN for the agent system prompt"
  value       = var.enable_agentcore ? aws_bedrockagent_prompt.system[0].arn : ""
}

output "deploy_widget_command" {
  description = "Command to deploy widget to S3 and invalidate CloudFront"
  value       = var.enable_agentcore ? "aws s3 cp ./packages/chatbot-snippet/dist/chatbot.js s3://${aws_s3_bucket.widget[0].id}/widget.js --content-type 'application/javascript' && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.widget[0].id} --paths '/widget.js'" : ""
}

# ---------------------------------------------------------------------------
# Dashboard outputs
# ---------------------------------------------------------------------------

output "dashboard_url" {
  description = "Dashboard URL (CloudFront)"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? local.dashboard_url : ""
}

output "dashboard_api_url" {
  description = "Dashboard API URL (Lambda Function URL, direct access)"
  value       = var.enable_dashboard ? aws_lambda_function_url.dashboard[0].function_url : ""
}

output "dashboard_cognito_user_pool_id" {
  description = "Dashboard Cognito user pool ID"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? aws_cognito_user_pool.dashboard[0].id : ""
}

output "dashboard_cognito_client_id" {
  description = "Dashboard Cognito client ID"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? aws_cognito_user_pool_client.dashboard[0].id : ""
}

output "dashboard_cognito_domain" {
  description = "Dashboard Cognito domain"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? "https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""
}

output "dashboard_oidc_discovery_url" {
  description = "Dashboard OIDC discovery URL (for AgentCore JWT validation)"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.dashboard[0].id}/.well-known/openid-configuration" : ""
}

output "deploy_dashboard_frontend_command" {
  description = "Command to deploy dashboard frontend to S3 and invalidate CloudFront"
  value       = var.enable_dashboard && var.enable_dashboard_ui ? "aws s3 sync ./apps/web/out s3://${aws_s3_bucket.dashboard[0].id} --delete && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.dashboard[0].id} --paths '/*'" : ""
}

output "deploy_dashboard_lambda_command" {
  description = "Command to update dashboard Lambda code"
  value       = var.enable_dashboard ? "cd apps/api && pnpm build && cd ../.. && cd terraform && terraform apply -target=aws_lambda_function.dashboard -auto-approve" : ""
}
