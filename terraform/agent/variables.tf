###############################################################################
# Agent77 — Agent stack variables
###############################################################################

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as a prefix for all resources. Use a unique value per site (e.g. acme-storefront, acme-support)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name must be lowercase alphanumeric with hyphens, 2-21 chars."
  }
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "enable_agentcore" {
  description = "Whether to provision the AgentCore runtime"
  type        = bool
  default     = true
}

variable "agentcore_model_id" {
  description = "Foundation model ID for AgentCore runtime"
  type        = string
  default     = "anthropic.claude-sonnet-4-6"
}

variable "agentcore_image_tag" {
  description = "Docker image tag for the AgentCore container"
  type        = string
  default     = "latest"
}

variable "agent_system_prompt" {
  description = "System prompt for the agent, managed via Bedrock Prompt Management"
  type        = string
  default     = "You are a helpful assistant. Answer questions clearly and concisely."
}

variable "oidc_discovery_url" {
  description = "OIDC discovery URL for JWT validation by AgentCore"
  type        = string
  default     = ""
}

variable "oidc_allowed_audience" {
  description = "Allowed audience for OIDC JWT validation"
  type        = string
  default     = ""
}

variable "enable_knowledge_base" {
  description = "Provision Bedrock Knowledge Base with S3 Vectors for document retrieval"
  type        = bool
  default     = false
}
