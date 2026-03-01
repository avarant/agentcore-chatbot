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

# ---------------------------------------------------------------------------
# Dashboard (optional)
# ---------------------------------------------------------------------------

variable "enable_dashboard" {
  description = "Provision the dashboard API (Lambda + Function URL) for conversation viewing"
  type        = bool
  default     = false
}

variable "enable_dashboard_ui" {
  description = "Provision the dashboard UI (Cognito + S3 + CloudFront). Requires enable_dashboard = true."
  type        = bool
  default     = false
}

variable "dashboard_api_key" {
  description = "API key for X-API-Key header authentication to the dashboard API"
  type        = string
  sensitive   = true
  default     = ""
}

variable "dashboard_domain" {
  description = "Custom domain for the dashboard CloudFront distribution (optional)"
  type        = string
  default     = ""
}
