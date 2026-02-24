###############################################################################
# Agent77 — agentcore.tf — AgentCore Runtime + Endpoint (native awscc provider)
###############################################################################

# ---------------------------------------------------------------------------
# Build agent ZIP artifact
# ---------------------------------------------------------------------------

resource "null_resource" "agent_zip" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    main_py_hash = filemd5("${path.module}/../agent/main.py")
    req_hash     = filemd5("${path.module}/../agent/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<-SCRIPT
      set -euo pipefail
      cd "${path.module}/../agent"
      rm -rf package agent.zip
      pip install -r requirements.txt -t package --quiet \
        --platform manylinux2014_aarch64 \
        --only-binary=:all:
      find package -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
      find package -name '*.pyc' -delete 2>/dev/null || true
      cd package && zip -r9 ../agent.zip . --quiet -x '*__pycache__*' '*.pyc'
      cd .. && zip -g agent.zip main.py
      echo "Agent ZIP built: $(ls -lh agent.zip | awk '{print $5}')"
    SCRIPT
    interpreter = ["/bin/bash", "-c"]
  }
}

# ---------------------------------------------------------------------------
# Upload agent ZIP to S3
# ---------------------------------------------------------------------------

resource "aws_s3_object" "agent_zip" {
  count = var.enable_agentcore ? 1 : 0

  bucket = aws_s3_bucket.frontend.id
  key    = "agent/agent.zip"
  source = "${path.module}/../agent/agent.zip"
  etag   = null_resource.agent_zip[0].id # force update when ZIP is rebuilt

  depends_on = [null_resource.agent_zip]
}

# ---------------------------------------------------------------------------
# IAM Role for AgentCore Runtime
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
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-agentcore-runtime"
  }
}

resource "aws_iam_role_policy" "agentcore_runtime" {
  count = var.enable_agentcore ? 1 : 0

  name = "${local.name_prefix}-agentcore-runtime"
  role = aws_iam_role.agentcore_runtime[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockModelInvoke"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ]
        Resource = "arn:${local.partition}:bedrock:${var.aws_region}::foundation-model/*"
      },
      {
        Sid    = "S3ReadArtifact"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
        ]
        Resource = "${aws_s3_bucket.frontend.arn}/agent/*"
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
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.config.arn,
          "${aws_dynamodb_table.config.arn}/index/*",
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# AgentCore Runtime (native awscc resource)
# ---------------------------------------------------------------------------

resource "awscc_bedrockagentcore_runtime" "main" {
  count = var.enable_agentcore ? 1 : 0

  agent_runtime_name = "${replace(local.name_prefix, "-", "_")}_runtime"
  description        = "Agent77 chatbot runtime"
  role_arn           = aws_iam_role.agentcore_runtime[0].arn

  agent_runtime_artifact = {
    code_configuration = {
      runtime     = "PYTHON_3_12"
      entry_point = ["main.py"]
      code = {
        s3 = {
          bucket = aws_s3_bucket.frontend.id
          prefix = "agent/agent.zip"
        }
      }
    }
  }

  network_configuration = {
    network_mode = "PUBLIC"
  }

  protocol_configuration = "HTTP"

  environment_variables = {
    MODEL_ID        = var.agentcore_model_id
    DYNAMODB_TABLE  = aws_dynamodb_table.config.name
    AWS_REGION_NAME = var.aws_region
  }

  depends_on = [
    aws_s3_object.agent_zip,
    aws_iam_role_policy.agentcore_runtime,
  ]
}

# ---------------------------------------------------------------------------
# AgentCore Runtime Endpoint
# ---------------------------------------------------------------------------

resource "awscc_bedrockagentcore_runtime_endpoint" "main" {
  count = var.enable_agentcore ? 1 : 0

  agent_runtime_id = awscc_bedrockagentcore_runtime.main[0].agent_runtime_id
  name             = "${replace(local.name_prefix, "-", "_")}_endpoint"
  description      = "Agent77 chatbot endpoint"
}

# ---------------------------------------------------------------------------
# Retrieve endpoint URL after creation
# ---------------------------------------------------------------------------

resource "null_resource" "agentcore_endpoint_url" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    endpoint_arn = awscc_bedrockagentcore_runtime_endpoint.main[0].agent_runtime_endpoint_arn
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-SCRIPT
      aws bedrock-agent-core get-agent-runtime-endpoint \
        --agent-runtime-endpoint-arn '${awscc_bedrockagentcore_runtime_endpoint.main[0].agent_runtime_endpoint_arn}' \
        --region ${var.aws_region} \
        --query 'endpointUrl' --output text \
        > '${path.module}/agentcore_endpoint_url.txt' 2>/dev/null || \
      echo "https://${awscc_bedrockagentcore_runtime_endpoint.main[0].runtime_endpoint_id}.runtime.bedrock-agentcore.${var.aws_region}.amazonaws.com" \
        > '${path.module}/agentcore_endpoint_url.txt'
    SCRIPT
  }
}

# ---------------------------------------------------------------------------
# Locals — expose endpoint info for other resources
# ---------------------------------------------------------------------------

locals {
  agentcore_endpoint_url = var.enable_agentcore ? awscc_bedrockagentcore_runtime_endpoint.main[0].agent_runtime_endpoint_arn : ""
  agentcore_runtime_id   = var.enable_agentcore ? awscc_bedrockagentcore_runtime.main[0].agent_runtime_id : ""
}
