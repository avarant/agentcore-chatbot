###############################################################################
# Agent77 — dashboard.tf — Dashboard API (Lambda + Function URL)
###############################################################################

locals {
  enable_dashboard = var.enable_dashboard ? 1 : 0
}

# ---------------------------------------------------------------------------
# Precondition: AgentCore must be enabled when dashboard is enabled
# ---------------------------------------------------------------------------

resource "null_resource" "dashboard_precondition" {
  count = local.enable_dashboard

  lifecycle {
    precondition {
      condition     = var.enable_agentcore
      error_message = "enable_agentcore must be true when enable_dashboard is true."
    }
  }
}

# ---------------------------------------------------------------------------
# IAM Role — Dashboard Lambda
# ---------------------------------------------------------------------------

resource "aws_iam_role" "dashboard_lambda" {
  count = local.enable_dashboard

  name = "${local.name_prefix}-dashboard-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-dashboard-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "dashboard_lambda_logs" {
  count = local.enable_dashboard

  role       = aws_iam_role.dashboard_lambda[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "dashboard_lambda_memory" {
  count = local.enable_dashboard

  name = "${local.name_prefix}-dashboard-lambda-memory"
  role = aws_iam_role.dashboard_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AgentCoreMemoryRead"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:ListActors",
          "bedrock-agentcore:ListSessions",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:GetEvent",
          "bedrock-agentcore:ListMemoryRecords",
        ]
        Resource = [
          "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:memory/${aws_bedrockagentcore_memory.main[0].id}",
          "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:memory/${aws_bedrockagentcore_memory.main[0].id}/*",
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "dashboard_lambda_prompts" {
  count = local.enable_dashboard

  name = "${local.name_prefix}-dashboard-lambda-prompts"
  role = aws_iam_role.dashboard_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockPromptManagement"
        Effect = "Allow"
        Action = [
          "bedrock:GetPrompt",
          "bedrock:UpdatePrompt",
          "bedrock:ListPrompts",
        ]
        Resource = [
          aws_bedrockagent_prompt.system[0].arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "dashboard_lambda_kb" {
  count = var.enable_dashboard && var.enable_knowledge_base ? 1 : 0

  name = "${local.name_prefix}-dashboard-lambda-kb"
  role = aws_iam_role.dashboard_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3DocsAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject",
        ]
        Resource = [
          aws_s3_bucket.kb_docs[0].arn,
          "${aws_s3_bucket.kb_docs[0].arn}/*",
        ]
      },
      {
        Sid    = "BedrockKBIngestion"
        Effect = "Allow"
        Action = [
          "bedrock:StartIngestionJob",
          "bedrock:GetIngestionJob",
        ]
        Resource = [
          aws_bedrockagent_knowledge_base.main[0].arn,
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda Function
# ---------------------------------------------------------------------------

data "archive_file" "dashboard_lambda" {
  count = local.enable_dashboard

  type        = "zip"
  source_dir  = "${path.module}/../apps/api/dist"
  output_path = "${path.module}/../apps/api/dist/dashboard-lambda.zip"
}

resource "aws_lambda_function" "dashboard" {
  count = local.enable_dashboard

  function_name    = "${local.name_prefix}-dashboard-api"
  role             = aws_iam_role.dashboard_lambda[0].arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 512
  filename         = data.archive_file.dashboard_lambda[0].output_path
  source_code_hash = data.archive_file.dashboard_lambda[0].output_base64sha256

  environment {
    variables = merge(
      {
        AGENTCORE_RUNTIME_URL = "https://bedrock-agentcore.${var.aws_region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_arn)}/invocations"
        AGENTCORE_MEMORY_ID   = aws_bedrockagentcore_memory.main[0].id
        AWS_REGION_NAME       = var.aws_region
        DASHBOARD_API_KEY     = var.dashboard_api_key
      },
      var.enable_agentcore ? {
        PROMPT_ID = aws_bedrockagent_prompt.system[0].id
      } : {},
      var.enable_dashboard_ui ? {
        COGNITO_USER_POOL_ID = aws_cognito_user_pool.dashboard[0].id
        COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.dashboard[0].id
        COGNITO_DOMAIN       = "https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com"
      } : {},
      var.enable_knowledge_base ? {
        KB_DOCS_BUCKET     = aws_s3_bucket.kb_docs[0].id
        KNOWLEDGE_BASE_ID  = aws_bedrockagent_knowledge_base.main[0].id
        KB_DATA_SOURCE_ID  = aws_bedrockagent_data_source.s3_docs[0].data_source_id
      } : {}
    )
  }

  tags = {
    Name = "${local.name_prefix}-dashboard-api"
  }

  depends_on = [null_resource.dashboard_precondition]
}

# ---------------------------------------------------------------------------
# Lambda Function URL (public, for direct access or CloudFront origin)
# ---------------------------------------------------------------------------

resource "aws_lambda_function_url" "dashboard" {
  count = local.enable_dashboard

  function_name      = aws_lambda_function.dashboard[0].function_name
  authorization_type = "NONE"
}
