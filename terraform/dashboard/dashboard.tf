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
  function_name = "${local.name_prefix}-dashboard-api"
  role          = aws_iam_role.dashboard_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  # Insights generation analyzes up to 200 sessions + a Bedrock Converse call,
  # so the dashboard Lambda needs a long timeout / extra memory for the weekly
  # EventBridge run. Normal HTTP requests return well under this.
  timeout          = 600
  memory_size      = 1024
  filename         = data.archive_file.dashboard_lambda.output_path
  source_code_hash = data.archive_file.dashboard_lambda.output_base64sha256

  environment {
    variables = merge(
      {
        SITES_CONFIG      = jsonencode(var.sites)
        AWS_REGION_NAME   = var.aws_region
        DASHBOARD_API_KEY = var.dashboard_api_key
        INSIGHTS_TABLE    = aws_dynamodb_table.insights.name
        BEDROCK_MODEL_ID  = var.insights_model_id
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

# Async invocations (EventBridge → weekly insights) must not retry: a timeout
# mid-run would re-generate sites that already completed.
resource "aws_lambda_function_event_invoke_config" "dashboard" {
  function_name          = aws_lambda_function.dashboard.function_name
  maximum_retry_attempts = 0
}

###############################################################################
# Insights — weekly conversation analysis (recurring questions, friction, topics)
###############################################################################

# ---------------------------------------------------------------------------
# DynamoDB — Insights cache (per site, 30-day TTL)
# ---------------------------------------------------------------------------

resource "aws_dynamodb_table" "insights" {
  name         = "${local.name_prefix}-insights"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "siteId"
  range_key    = "version"

  attribute {
    name = "siteId"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name = "${local.name_prefix}-insights"
  }
}

resource "aws_iam_role_policy" "dashboard_lambda_insights_dynamo" {
  name = "${local.name_prefix}-dashboard-lambda-insights-dynamo"
  role = aws_iam_role.dashboard_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBInsightsCache"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
        ]
        Resource = [
          aws_dynamodb_table.insights.arn,
        ]
      }
    ]
  })
}

# Bedrock Converse for the insights LLM analysis.
resource "aws_iam_role_policy" "dashboard_lambda_bedrock_invoke" {
  name = "${local.name_prefix}-dashboard-lambda-bedrock-invoke"
  role = aws_iam_role.dashboard_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BedrockRuntimeInvoke"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# EventBridge — weekly insights regeneration (Mondays 07:00 UTC)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "insights_weekly" {
  name                = "${local.name_prefix}-insights-weekly"
  description         = "Regenerate dashboard insights every Monday at 07:00 UTC"
  schedule_expression = "cron(0 7 ? * MON *)"
}

resource "aws_cloudwatch_event_target" "insights_weekly" {
  rule      = aws_cloudwatch_event_rule.insights_weekly.name
  target_id = "dashboard-lambda"
  arn       = aws_lambda_function.dashboard.arn
  input     = jsonencode({ action = "generate_insights_all_sites" })
}

resource "aws_lambda_permission" "insights_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridgeInsights"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dashboard.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.insights_weekly.arn
}
