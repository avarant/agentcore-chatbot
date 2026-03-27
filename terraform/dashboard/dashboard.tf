###############################################################################
# AgentCore Chatbot — Dashboard stack — Lambda API
###############################################################################

# ---------------------------------------------------------------------------
# IAM Role — Dashboard Lambda
# ---------------------------------------------------------------------------

resource "aws_iam_role" "dashboard_lambda" {
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
  role       = aws_iam_role.dashboard_lambda.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "dashboard_lambda_memory" {
  count = length(local.memory_arns) > 0 ? 1 : 0

  name = "${local.name_prefix}-dashboard-lambda-memory"
  role = aws_iam_role.dashboard_lambda.id

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
        Resource = concat(
          local.memory_arns,
          [for arn in local.memory_arns : "${arn}/*"]
        )
      }
    ]
  })
}

resource "aws_iam_role_policy" "dashboard_lambda_prompts" {
  count = length(local.prompt_arns) > 0 ? 1 : 0

  name = "${local.name_prefix}-dashboard-lambda-prompts"
  role = aws_iam_role.dashboard_lambda.id

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
        Resource = local.prompt_arns
      }
    ]
  })
}

resource "aws_iam_role_policy" "dashboard_lambda_kb" {
  count = length(local.kb_bucket_arns) > 0 ? 1 : 0

  name = "${local.name_prefix}-dashboard-lambda-kb"
  role = aws_iam_role.dashboard_lambda.id

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
        Resource = local.kb_bucket_arns
      },
      {
        Sid    = "BedrockKBIngestion"
        Effect = "Allow"
        Action = [
          "bedrock:StartIngestionJob",
          "bedrock:GetIngestionJob",
        ]
        Resource = length(local.kb_arns) > 0 ? local.kb_arns : ["arn:${local.partition}:bedrock:${var.aws_region}:${local.account_id}:knowledge-base/*"]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda Function
# ---------------------------------------------------------------------------

data "archive_file" "dashboard_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/api/dist"
  output_path = "${path.module}/../../apps/api/dist/dashboard-lambda.zip"
}

resource "aws_lambda_function" "dashboard" {
  function_name    = "${local.name_prefix}-dashboard-api"
  role             = aws_iam_role.dashboard_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 512
  filename         = data.archive_file.dashboard_lambda.output_path
  source_code_hash = data.archive_file.dashboard_lambda.output_base64sha256

  environment {
    variables = merge(
      {
        SITES_CONFIG      = jsonencode(var.sites)
        AWS_REGION_NAME   = var.aws_region
        DASHBOARD_API_KEY = var.dashboard_api_key
      },
      local.enable_dashboard_ui == 1 ? {
        COGNITO_USER_POOL_ID = aws_cognito_user_pool.dashboard[0].id
        COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.dashboard[0].id
        COGNITO_DOMAIN       = "https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com"
      } : {}
    )
  }

  tags = {
    Name = "${local.name_prefix}-dashboard-api"
  }
}

# ---------------------------------------------------------------------------
# Lambda Function URL (public, for direct access or CloudFront origin)
# ---------------------------------------------------------------------------

resource "aws_lambda_function_url" "dashboard" {
  function_name      = aws_lambda_function.dashboard.function_name
  authorization_type = "NONE"
}
