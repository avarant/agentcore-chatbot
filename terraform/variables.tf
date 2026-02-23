###############################################################################
# Agent77 — variables.tf
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

variable "domain" {
  description = "Custom domain for CloudFront (leave empty to use the default CloudFront domain)"
  type        = string
  default     = ""
}

variable "agent_image_uri" {
  description = "Full ECR image URI for the agent container (e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/agent77-agent:latest)"
  type        = string
  default     = ""
}

variable "lambda_memory_size" {
  description = "Memory (MB) for the API Lambda function"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Timeout (seconds) for the API Lambda function"
  type        = number
  default     = 30
}

variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode: PAY_PER_REQUEST or PROVISIONED"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix. Defaults to project_name."
  type        = string
  default     = ""
}

variable "enable_agentcore" {
  description = "Whether to provision the AgentCore runtime and endpoint via AWS CLI"
  type        = bool
  default     = true
}

variable "agentcore_model_id" {
  description = "Foundation model ID for AgentCore runtime (e.g. anthropic.claude-3-sonnet-20240229-v1:0)"
  type        = string
  default     = "anthropic.claude-3-sonnet-20240229-v1:0"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}
