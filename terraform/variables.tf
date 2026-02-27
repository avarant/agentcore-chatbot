###############################################################################
# Agent77 — variables.tf (AgentCore-only)
###############################################################################

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as a prefix for all resources"
  type        = string
  default     = "agent77"

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
  description = "Whether to provision the AgentCore runtime and endpoint via AWS CLI"
  type        = bool
  default     = true
}

variable "agentcore_model_id" {
  description = "Foundation model ID for AgentCore runtime (e.g. anthropic.claude-sonnet-4-6)"
  type        = string
  default     = "anthropic.claude-sonnet-4-6"
}

variable "agentcore_image_tag" {
  description = "Docker image tag for the AgentCore container"
  type        = string
  default     = "latest"
}

variable "oidc_discovery_url" {
  description = "OIDC discovery URL for the customer's auth provider (used for AgentCore JWT validation). When set, replaces the default Cognito-based authorizer."
  type        = string
  default     = ""
}

variable "oidc_allowed_audience" {
  description = "Allowed audience for OIDC JWT validation (typically the client ID from the auth provider)"
  type        = string
  default     = ""
}
