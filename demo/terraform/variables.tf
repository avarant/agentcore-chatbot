###############################################################################
# Demo App — variables.tf
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
}

variable "domain" {
  description = "Custom domain for the demo CloudFront distribution (leave empty for default CloudFront domain)"
  type        = string
  default     = ""
}

variable "agentcore_runtime_url" {
  description = "AgentCore runtime invoke URL from the main stack (baked into index.html)"
  type        = string
}

variable "widget_url" {
  description = "URL of the chatbot widget JS (e.g. https://demo.agent77.app/widget.js)"
  type        = string
}
