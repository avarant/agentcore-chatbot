###############################################################################
# Agent77 — Dashboard stack (deploy once, manages all sites)
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
  #   bucket         = "agent77-tfstate-ACCOUNT_ID"
  #   key            = "agent77/dashboard/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "agent77-tflock"
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

  enable_dashboard_ui = var.enable_dashboard_ui ? 1 : 0

  # Computed ARNs from site configs for IAM policies
  memory_arns = distinct([
    for s in var.sites : "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:memory/${s.memory_id}"
    if s.memory_id != ""
  ])

  prompt_arns = distinct([
    for s in var.sites : "arn:${local.partition}:bedrock:${var.aws_region}:${local.account_id}:prompt/${s.prompt_id}"
    if s.prompt_id != ""
  ])

  kb_arns = distinct([
    for s in var.sites : "arn:${local.partition}:bedrock:${var.aws_region}:${local.account_id}:knowledge-base/${s.kb_id}"
    if s.kb_id != ""
  ])

  kb_bucket_arns = distinct(flatten([
    for s in var.sites : [
      "arn:${local.partition}:s3:::${s.kb_bucket}",
      "arn:${local.partition}:s3:::${s.kb_bucket}/*",
    ]
    if s.kb_bucket != ""
  ]))
}
