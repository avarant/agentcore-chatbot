###############################################################################
# Agent77 — Agent stack outputs
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
  description = "AgentCore runtime invoke URL"
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
  description = "Bedrock Prompt ID"
  value       = var.enable_agentcore ? aws_bedrockagent_prompt.system[0].id : ""
}

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base ID"
  value       = var.enable_knowledge_base ? aws_bedrockagent_knowledge_base.main[0].id : ""
}

output "kb_data_source_id" {
  description = "Bedrock Knowledge Base data source ID"
  value       = var.enable_knowledge_base ? aws_bedrockagent_data_source.s3_docs[0].data_source_id : ""
}

output "kb_docs_bucket" {
  description = "S3 bucket for knowledge base document uploads"
  value       = var.enable_knowledge_base ? aws_s3_bucket.kb_docs[0].id : ""
}

output "deploy_widget_command" {
  description = "Command to deploy widget to S3 and invalidate CloudFront"
  value       = var.enable_agentcore ? "aws s3 cp ./packages/chatbot-snippet/dist/chatbot.js s3://${aws_s3_bucket.widget[0].id}/widget.js --content-type 'application/javascript' && aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.widget[0].id} --paths '/widget.js'" : ""
}

# ---------------------------------------------------------------------------
# site_config — copy these values into the dashboard stack's sites variable
# ---------------------------------------------------------------------------

output "site_config" {
  description = "Site configuration to paste into the dashboard stack's sites variable"
  value = {
    prompt_id         = var.enable_agentcore ? aws_bedrockagent_prompt.system[0].id : ""
    kb_id             = var.enable_knowledge_base ? aws_bedrockagent_knowledge_base.main[0].id : ""
    kb_data_source_id = var.enable_knowledge_base ? aws_bedrockagent_data_source.s3_docs[0].data_source_id : ""
    kb_bucket         = var.enable_knowledge_base ? aws_s3_bucket.kb_docs[0].id : ""
    memory_id         = var.enable_agentcore ? aws_bedrockagentcore_memory.main[0].id : ""
    runtime_url       = var.enable_agentcore ? "https://bedrock-agentcore.${var.aws_region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_arn)}/invocations" : ""
  }
}

