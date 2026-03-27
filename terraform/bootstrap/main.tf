###############################################################################
# AgentCore Chatbot — bootstrap/main.tf — Create S3 backend + DynamoDB lock table
#
# Run this ONCE before the main terraform:
#   cd terraform/bootstrap
#   terraform init && terraform apply
#
# Then configure the main backend in terraform/main.tf and run:
#   cd terraform
#   terraform init -migrate-state
###############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name (must match main terraform)"
  type        = string
  default     = "agentcore-chatbot"
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  bucket_name = "${var.project_name}-tfstate-${local.account_id}"
  table_name  = "${var.project_name}-tflock"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  tags = {
    Name      = local.bucket_name
    Project   = var.project_name
    ManagedBy = "terraform-bootstrap"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tflock" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name      = local.table_name
    Project   = var.project_name
    ManagedBy = "terraform-bootstrap"
  }
}

output "backend_config" {
  description = "Copy this into terraform/main.tf backend block"
  value       = <<-EOT
    backend "s3" {
      bucket         = "${local.bucket_name}"
      key            = "${var.project_name}/terraform.tfstate"
      region         = "${var.aws_region}"
      dynamodb_table = "${local.table_name}"
      encrypt        = true
    }
  EOT
}

output "bucket_name" {
  value = aws_s3_bucket.tfstate.id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.tflock.name
}
