###############################################################################
# Demo App — lambda.tf — API Lambda (apps/api)
###############################################################################

# ---------------------------------------------------------------------------
# IAM Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "demo_lambda" {
  name = "${local.name_prefix}-lambda"

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
    Name = "${local.name_prefix}-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "demo_lambda_logs" {
  role       = aws_iam_role.demo_lambda.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "demo_lambda_memory" {
  name = "${local.name_prefix}-lambda-memory"
  role = aws_iam_role.demo_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AgentCoreMemoryRead"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:ListSessions",
          "bedrock-agentcore:ListEvents",
          "bedrock-agentcore:GetEvent",
          "bedrock-agentcore:ListMemoryRecords",
        ]
        Resource = [
          "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:memory/${var.agentcore_memory_id}",
          "arn:${local.partition}:bedrock-agentcore:${var.aws_region}:${local.account_id}:memory/${var.agentcore_memory_id}/*",
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda Function
# ---------------------------------------------------------------------------

data "archive_file" "demo_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/api/dist"
  output_path = "${path.module}/../../apps/api/dist/lambda.zip"
}

resource "aws_lambda_function" "demo" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.demo_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 512
  filename         = data.archive_file.demo_lambda.output_path
  source_code_hash = data.archive_file.demo_lambda.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.demo.id
      COGNITO_CLIENT_ID      = aws_cognito_user_pool_client.demo.id
      COGNITO_DOMAIN         = "https://${aws_cognito_user_pool_domain.demo.domain}.auth.${var.aws_region}.amazoncognito.com"
      AGENTCORE_RUNTIME_URL  = var.agentcore_runtime_url
      AGENTCORE_MEMORY_ID    = var.agentcore_memory_id
      AWS_REGION_NAME        = var.aws_region
    }
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

# Update DASHBOARD_URL env var after CloudFront domain is known
# Also re-triggers when Lambda code changes (update-function-code resets env vars)
resource "null_resource" "update_lambda_env" {
  triggers = {
    demo_url    = local.demo_url
    source_hash = data.archive_file.demo_lambda.output_base64sha256
  }

  provisioner "local-exec" {
    command = <<-EOF
      aws lambda update-function-configuration \
        --function-name ${aws_lambda_function.demo.function_name} \
        --environment "Variables={COGNITO_USER_POOL_ID=${aws_cognito_user_pool.demo.id},COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.demo.id},COGNITO_DOMAIN=https://${aws_cognito_user_pool_domain.demo.domain}.auth.${var.aws_region}.amazoncognito.com,AGENTCORE_RUNTIME_URL=${var.agentcore_runtime_url},AGENTCORE_MEMORY_ID=${var.agentcore_memory_id},AWS_REGION_NAME=${var.aws_region},DASHBOARD_URL=${local.demo_url}}" \
        --region ${var.aws_region} > /dev/null
    EOF
  }

  depends_on = [aws_cloudfront_distribution.demo, aws_lambda_function.demo]
}

# ---------------------------------------------------------------------------
# Lambda Function URL (public, for CloudFront origin)
# ---------------------------------------------------------------------------

resource "aws_lambda_function_url" "demo" {
  function_name      = aws_lambda_function.demo.function_name
  authorization_type = "NONE"
}
