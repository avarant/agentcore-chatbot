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
