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

output "deploy_widget_command" {
  description = "Command to deploy widget to S3 and invalidate CloudFront"
  value       = var.enable_agentcore ? "aws s3 cp ./packages/chatbot-snippet/dist/chatbot.js s3://${aws_s3_bucket.widget[0].id}/widget.js --content-type 'application/javascript' && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.widget[0].id} --paths '/widget.js'" : ""
}
