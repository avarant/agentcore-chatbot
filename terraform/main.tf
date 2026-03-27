###############################################################################
# AgentCore Chatbot — AgentCore-only stack
# main.tf — Provider, backend, locals
###############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # Remote backend — run `terraform/bootstrap` first, then uncomment:
  # backend "s3" {
  #   bucket         = "agentcore-chatbot-tfstate-ACCOUNT_ID"
  #   key            = "agentcore-chatbot/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "agentcore-chatbot-tflock"
  #   encrypt        = true
  # }

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

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  name_prefix = var.project_name
}
