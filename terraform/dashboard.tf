###############################################################################
# Agent77 — dashboard.tf — Dashboard API (Lambda + Function URL)
###############################################################################

locals {
  enable_dashboard = var.enable_dashboard ? 1 : 0

  dashboard_url = var.enable_dashboard && var.enable_dashboard_ui ? (
    var.dashboard_domain != "" ? "https://${var.dashboard_domain}" : "https://${aws_cloudfront_distribution.dashboard[0].domain_name}"
  ) : ""
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
      var.enable_dashboard_ui ? {
        COGNITO_USER_POOL_ID = aws_cognito_user_pool.dashboard[0].id
        COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.dashboard[0].id
        COGNITO_DOMAIN       = "https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com"
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

# ---------------------------------------------------------------------------
# Update DASHBOARD_URL env var after CloudFront domain is known (UI only)
# ---------------------------------------------------------------------------

resource "null_resource" "update_dashboard_lambda_env" {
  count = var.enable_dashboard && var.enable_dashboard_ui ? 1 : 0

  triggers = {
    dashboard_url = local.dashboard_url
    source_hash   = data.archive_file.dashboard_lambda[0].output_base64sha256
  }

  provisioner "local-exec" {
    command = <<-EOF
      aws lambda update-function-configuration \
        --function-name ${aws_lambda_function.dashboard[0].function_name} \
        --environment "Variables={COGNITO_USER_POOL_ID=${aws_cognito_user_pool.dashboard[0].id},COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.dashboard[0].id},COGNITO_DOMAIN=https://${aws_cognito_user_pool_domain.dashboard[0].domain}.auth.${var.aws_region}.amazoncognito.com,AGENTCORE_RUNTIME_URL=https://bedrock-agentcore.${var.aws_region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.main[0].agent_runtime_arn)}/invocations,AGENTCORE_MEMORY_ID=${aws_bedrockagentcore_memory.main[0].id},AWS_REGION_NAME=${var.aws_region},DASHBOARD_API_KEY=${var.dashboard_api_key},DASHBOARD_URL=${local.dashboard_url}}" \
        --region ${var.aws_region} > /dev/null
    EOF
  }

  depends_on = [aws_cloudfront_distribution.dashboard, aws_lambda_function.dashboard]
}
