###############################################################################
# Agent77 — Self-Hosted Chatbot Platform
# main.tf — Provider, backend, locals
###############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# Secondary provider for CloudFront ACM certs (must be us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "awscc" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# Default VPC + subnets for AgentCore networking
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  name_prefix = var.project_name

  # When a custom domain is set, use it. Otherwise these are populated after
  # CloudFront is created (see outputs.tf). Lambda env vars use the domain
  # variable to avoid a circular dependency with CloudFront.
  dashboard_url = var.domain != "" ? "https://${var.domain}" : ""
  api_url       = var.domain != "" ? "https://${var.domain}/api" : ""
  snippet_url   = var.domain != "" ? "https://${var.domain}/snippet.js" : ""

  # Cognito callback — uses custom domain if set, otherwise API Gateway directly
  cognito_callback_url = var.domain != "" ? "https://${var.domain}/api/auth/callback" : "${aws_apigatewayv2_api.main.api_endpoint}/api/auth/callback"
  cognito_logout_url   = var.domain != "" ? "https://${var.domain}" : "http://localhost:3000"
}
