###############################################################################
# Agent77 — agentcore.tf — Container-based deploy via ECR + CodeBuild
###############################################################################

# ---------------------------------------------------------------------------
# ECR Repository
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "agent" {
  count = var.enable_agentcore ? 1 : 0

  name                 = "${local.name_prefix}-agent"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name_prefix}-agent"
  }
}

resource "aws_ecr_lifecycle_policy" "agent" {
  count = var.enable_agentcore ? 1 : 0

  repository = aws_ecr_repository.agent[0].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# S3 — Agent source code bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "agent_source" {
  count = var.enable_agentcore ? 1 : 0

  bucket        = "${local.name_prefix}-agent-source-${local.account_id}"
  force_destroy = true

  tags = {
    Name = "${local.name_prefix}-agent-source"
  }
}

resource "aws_s3_bucket_versioning" "agent_source" {
  count = var.enable_agentcore ? 1 : 0

  bucket = aws_s3_bucket.agent_source[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

# ---------------------------------------------------------------------------
# ZIP and upload agent source to S3
# ---------------------------------------------------------------------------

data "archive_file" "agent_source" {
  count = var.enable_agentcore ? 1 : 0

  type        = "zip"
  source_dir  = "${path.module}/../agent"
  output_path = "${path.module}/../agent-source.zip"
  excludes    = ["package", "agent.zip", "__pycache__", "*.pyc"]
}

resource "aws_s3_object" "agent_source" {
  count = var.enable_agentcore ? 1 : 0

  bucket = aws_s3_bucket.agent_source[0].id
  key    = "agent-source.zip"
  source = data.archive_file.agent_source[0].output_path
  etag   = data.archive_file.agent_source[0].output_md5

  depends_on = [data.archive_file.agent_source]
}

# ---------------------------------------------------------------------------
# IAM Role — CodeBuild
# ---------------------------------------------------------------------------

resource "aws_iam_role" "codebuild" {
  count = var.enable_agentcore ? 1 : 0

  name = "${local.name_prefix}-codebuild"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-codebuild"
  }
}

resource "aws_iam_role_policy" "codebuild" {
  count = var.enable_agentcore ? 1 : 0

  name = "${local.name_prefix}-codebuild"
  role = aws_iam_role.codebuild[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3ReadSource"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetBucketVersioning",
        ]
        Resource = [
          aws_s3_bucket.agent_source[0].arn,
          "${aws_s3_bucket.agent_source[0].arn}/*",
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# CodeBuild Project — Build Docker image and push to ECR
# ---------------------------------------------------------------------------

resource "aws_codebuild_project" "agent" {
  count = var.enable_agentcore ? 1 : 0

  name          = "${local.name_prefix}-agent-build"
  description   = "Build Agent77 container image and push to ECR"
  service_role  = aws_iam_role.codebuild[0].arn
  build_timeout = 15

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/amazonlinux2-aarch64-standard:3.0"
    type                        = "ARM_CONTAINER"
    privileged_mode             = true
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "AWS_ACCOUNT_ID"
      value = local.account_id
    }

    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }

    environment_variable {
      name  = "ECR_REPO_URI"
      value = aws_ecr_repository.agent[0].repository_url
    }

    environment_variable {
      name  = "IMAGE_TAG"
      value = var.agentcore_image_tag
    }
  }

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.agent_source[0].id}/agent-source.zip"
    buildspec = file("${path.module}/buildspec.yml")
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${local.name_prefix}-agent-build"
      stream_name = "build"
    }
  }

  tags = {
    Name = "${local.name_prefix}-agent-build"
  }
}

# ---------------------------------------------------------------------------
# Trigger CodeBuild when source changes
# ---------------------------------------------------------------------------

resource "null_resource" "trigger_build" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    source_hash = data.archive_file.agent_source[0].output_md5
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = "${path.module}/scripts/build-image.sh ${aws_codebuild_project.agent[0].name} ${aws_ecr_repository.agent[0].repository_url} ${var.agentcore_image_tag} ${var.aws_region}"
  }

  depends_on = [
    aws_codebuild_project.agent,
    aws_s3_object.agent_source,
  ]
}

# ---------------------------------------------------------------------------
# IAM Role — AgentCore Runtime (execution role)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "agentcore_runtime" {
  count = var.enable_agentcore ? 1 : 0

  name = "${local.name_prefix}-agentcore-runtime"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "bedrock-agentcore.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:*"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-agentcore-runtime"
  }
}

resource "aws_iam_role_policy_attachment" "agentcore_managed" {
  count = var.enable_agentcore ? 1 : 0

  role       = aws_iam_role.agentcore_runtime[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/BedrockAgentCoreFullAccess"
}

resource "aws_iam_role_policy" "agentcore_runtime" {
  count = var.enable_agentcore ? 1 : 0

  name = "${local.name_prefix}-agentcore-runtime"
  role = aws_iam_role.agentcore_runtime[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Sid    = "XRay"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      },
      {
        Sid    = "BedrockModelInvoke"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:GetFoundationModel",
        ]
        Resource = "*"
      },
      {
        Sid    = "BedrockPromptRead"
        Effect = "Allow"
        Action = [
          "bedrock:GetPrompt",
        ]
        Resource = "*"
      },
      {
        Sid    = "MarketplaceSubscription"
        Effect = "Allow"
        Action = [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe",
        ]
        Resource = "*"
      },
      {
        Sid    = "WorkloadIdentityToken"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:GetWorkloadIdentityToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "BedrockRetrieve"
        Effect = "Allow"
        Action = [
          "bedrock:Retrieve",
        ]
        Resource = var.enable_knowledge_base ? [aws_bedrockagent_knowledge_base.main[0].arn] : ["*"]
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# AgentCore Runtime — Container configuration
# ---------------------------------------------------------------------------

resource "aws_bedrockagentcore_agent_runtime" "main" {
  count = var.enable_agentcore ? 1 : 0

  agent_runtime_name = "${replace(local.name_prefix, "-", "_")}_runtime"
  description        = "Agent77 chatbot runtime"
  role_arn           = aws_iam_role.agentcore_runtime[0].arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = "${aws_ecr_repository.agent[0].repository_url}:${var.agentcore_image_tag}"
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "HTTP"
  }

  request_header_configuration {
    request_header_allowlist = ["Authorization"]
  }

  dynamic "authorizer_configuration" {
    for_each = var.oidc_discovery_url != "" ? [1] : []
    content {
      custom_jwt_authorizer {
        discovery_url    = var.oidc_discovery_url
        allowed_audience = [var.oidc_allowed_audience]
      }
    }
  }

  environment_variables = merge(
    {
      MODEL_ID            = var.agentcore_model_id
      AWS_REGION_NAME     = var.aws_region
      AGENTCORE_MEMORY_ID = var.enable_agentcore ? aws_bedrockagentcore_memory.main[0].id : ""
      PROMPT_ID           = var.enable_agentcore ? aws_bedrockagent_prompt.system[0].id : ""
    },
    var.enable_knowledge_base ? {
      KNOWLEDGE_BASE_ID = aws_bedrockagent_knowledge_base.main[0].id
    } : {}
  )

  depends_on = [
    null_resource.trigger_build,
    aws_iam_role_policy.agentcore_runtime,
    aws_iam_role_policy_attachment.agentcore_managed,
  ]
}

# ---------------------------------------------------------------------------
# AgentCore Memory — conversation persistence
# ---------------------------------------------------------------------------

resource "aws_bedrockagentcore_memory" "main" {
  count = var.enable_agentcore ? 1 : 0

  name                 = "${replace(local.name_prefix, "-", "_")}_memory"
  description          = "Agent77 conversation memory"
  event_expiry_duration = 30 # days

  tags = {
    Name = "${local.name_prefix}-memory"
  }
}

resource "aws_bedrockagentcore_memory_strategy" "summary" {
  count = var.enable_agentcore ? 1 : 0

  name       = "${replace(local.name_prefix, "-", "_")}_summary"
  memory_id  = aws_bedrockagentcore_memory.main[0].id
  type       = "SUMMARIZATION"
  namespaces = ["/summaries/{actorId}/{sessionId}"]
}

# ---------------------------------------------------------------------------
# Locals — expose runtime info for other resources
# ---------------------------------------------------------------------------

locals {
  agentcore_runtime_id  = var.enable_agentcore ? aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_id : ""
  agentcore_runtime_arn = var.enable_agentcore ? aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_arn : ""
}

# ---------------------------------------------------------------------------
# Bedrock Prompt Management — system prompt
# ---------------------------------------------------------------------------

resource "aws_bedrockagent_prompt" "system" {
  count = var.enable_agentcore ? 1 : 0

  name        = "${replace(local.name_prefix, "-", "_")}_system_prompt"
  description = "Agent77 system prompt"

  default_variant = "default"

  variant {
    name          = "default"
    template_type = "TEXT"

    model_id = var.agentcore_model_id

    template_configuration {
      text {
        text = var.agent_system_prompt
      }
    }
  }

  tags = {
    Name = "${local.name_prefix}-system-prompt"
  }
}
