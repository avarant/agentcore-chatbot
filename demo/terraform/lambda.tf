###############################################################################
# Demo App — lambda.tf — Token endpoint Lambda
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

# ---------------------------------------------------------------------------
# Lambda Function
# ---------------------------------------------------------------------------

data "archive_file" "demo_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../api/dist"
  output_path = "${path.module}/../api/dist/lambda.zip"
}

resource "aws_lambda_function" "demo" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.demo_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.demo_lambda.output_path
  source_code_hash = data.archive_file.demo_lambda.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.demo.id
      COGNITO_CLIENT_ID     = aws_cognito_user_pool_client.demo.id
      COGNITO_CLIENT_SECRET = aws_cognito_user_pool_client.demo.client_secret
      COGNITO_DOMAIN        = "https://${aws_cognito_user_pool_domain.demo.domain}.auth.${var.aws_region}.amazoncognito.com"
      AWS_REGION_NAME       = var.aws_region
    }
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

# Update DEMO_URL env var after CloudFront domain is known
resource "null_resource" "update_lambda_env" {
  triggers = {
    demo_url = local.demo_url
  }

  provisioner "local-exec" {
    command = <<-EOF
      aws lambda update-function-configuration \
        --function-name ${aws_lambda_function.demo.function_name} \
        --environment "Variables={COGNITO_USER_POOL_ID=${aws_cognito_user_pool.demo.id},COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.demo.id},COGNITO_CLIENT_SECRET=${aws_cognito_user_pool_client.demo.client_secret},COGNITO_DOMAIN=https://${aws_cognito_user_pool_domain.demo.domain}.auth.${var.aws_region}.amazoncognito.com,AWS_REGION_NAME=${var.aws_region},DEMO_URL=${local.demo_url}}" \
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
