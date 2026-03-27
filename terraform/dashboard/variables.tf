###############################################################################
# AgentCore Chatbot — Dashboard stack variables
###############################################################################

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as a prefix for all resources"
  type        = string
  default     = "agentcore-chatbot"

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

# ---------------------------------------------------------------------------
# Sites — one entry per deployed agent stack.
# Copy values from each agent stack's `terraform output site_config` output.
# ---------------------------------------------------------------------------

variable "sites" {
  description = "List of agent site configurations. Each entry maps to a deployed agent stack."
  type = list(object({
    id                = string            # unique slug, e.g. "acme-storefront"
    name              = string            # display name in dashboard UI
    prompt_id         = string            # Bedrock Prompt ID
    memory_id         = string            # AgentCore Memory ID
    runtime_url       = string            # AgentCore Runtime invoke URL
    kb_id             = optional(string, "")
    kb_data_source_id = optional(string, "")
    kb_bucket         = optional(string, "")
  }))
  default = []
}

# ---------------------------------------------------------------------------
# Dashboard UI (optional)
# ---------------------------------------------------------------------------

variable "enable_dashboard_ui" {
  description = "Provision the dashboard UI (Cognito + S3 + CloudFront)"
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
