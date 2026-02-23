###############################################################################
# Agent77 — agentcore.tf — AgentCore Runtime + Endpoint via AWS CLI
#
# There is no native Terraform provider for Amazon Bedrock AgentCore, so we
# use null_resource + local-exec to call the AWS CLI.  The CLI output is
# persisted to a local JSON file so other resources can reference the ARN.
###############################################################################

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
          Service = "bedrock.amazonaws.com"
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
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken",
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
# Create AgentCore Runtime via AWS CLI
# ---------------------------------------------------------------------------

resource "null_resource" "agentcore_runtime" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    project_name = var.project_name
    role_arn     = aws_iam_role.agentcore_runtime[0].arn
    image_uri    = var.agent_image_uri
    region       = var.aws_region
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-euo", "pipefail", "-c"]

    command = <<-SCRIPT
      echo "Creating AgentCore runtime..."

      RUNTIME_OUTPUT=$(aws bedrock-agent create-agent-runtime \
        --agent-runtime-name "${var.project_name}-runtime" \
        --description "Agent77 chatbot runtime" \
        --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"${var.agent_image_uri != "" ? var.agent_image_uri : aws_ecr_repository.agent.repository_url}:latest"}}' \
        --role-arn "${aws_iam_role.agentcore_runtime[0].arn}" \
        --region "${var.aws_region}" \
        --output json 2>&1) || true

      echo "$RUNTIME_OUTPUT" > "${path.module}/agentcore_runtime_output.json"
      echo "Runtime creation output saved."

      # Extract the runtime ARN
      RUNTIME_ARN=$(echo "$RUNTIME_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('agentRuntimeArn',''))" 2>/dev/null || echo "")

      if [ -z "$RUNTIME_ARN" ]; then
        echo "WARNING: Could not extract runtime ARN. The runtime may already exist or the CLI command format may differ."
        echo "Check agentcore_runtime_output.json for details."
        # Try to describe existing runtime
        EXISTING=$(aws bedrock-agent list-agent-runtimes \
          --region "${var.aws_region}" \
          --output json 2>/dev/null || echo "{}")
        echo "$EXISTING" > "${path.module}/agentcore_list_output.json"
      fi

      echo "AgentCore runtime provisioning step complete."
    SCRIPT
  }

  depends_on = [
    aws_iam_role.agentcore_runtime,
    aws_iam_role_policy.agentcore_runtime,
  ]
}

# ---------------------------------------------------------------------------
# Create AgentCore Endpoint via AWS CLI
# ---------------------------------------------------------------------------

resource "null_resource" "agentcore_endpoint" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    runtime_id = null_resource.agentcore_runtime[0].id
    region     = var.aws_region
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-euo", "pipefail", "-c"]

    command = <<-SCRIPT
      echo "Creating AgentCore endpoint..."

      # Read the runtime ARN from the saved output
      RUNTIME_ARN=""
      if [ -f "${path.module}/agentcore_runtime_output.json" ]; then
        RUNTIME_ARN=$(python3 -c "
import json
try:
    with open('${path.module}/agentcore_runtime_output.json') as f:
        data = json.load(f)
    print(data.get('agentRuntimeArn', ''))
except:
    print('')
" 2>/dev/null || echo "")
      fi

      if [ -z "$RUNTIME_ARN" ]; then
        echo "WARNING: No runtime ARN found. Skipping endpoint creation."
        echo '{"status":"skipped","reason":"no_runtime_arn"}' > "${path.module}/agentcore_endpoint_output.json"
        exit 0
      fi

      ENDPOINT_OUTPUT=$(aws bedrock-agent create-agent-runtime-endpoint \
        --agent-runtime-arn "$RUNTIME_ARN" \
        --agent-runtime-endpoint-name "${var.project_name}-endpoint" \
        --description "Agent77 chatbot endpoint" \
        --region "${var.aws_region}" \
        --output json 2>&1) || true

      echo "$ENDPOINT_OUTPUT" > "${path.module}/agentcore_endpoint_output.json"
      echo "Endpoint creation output saved."
    SCRIPT
  }

  depends_on = [
    null_resource.agentcore_runtime,
  ]
}

# ---------------------------------------------------------------------------
# Destroy-time provisioners (cleanup)
# ---------------------------------------------------------------------------

resource "null_resource" "agentcore_cleanup" {
  count = var.enable_agentcore ? 1 : 0

  triggers = {
    project_name = var.project_name
    region       = var.aws_region
    module_path  = path.module
  }

  provisioner "local-exec" {
    when        = destroy
    interpreter = ["/bin/bash", "-c"]

    command = <<-SCRIPT
      echo "Cleaning up AgentCore resources..."

      # Read endpoint info
      if [ -f "${self.triggers.module_path}/agentcore_endpoint_output.json" ]; then
        ENDPOINT_ARN=$(python3 -c "
import json
try:
    with open('${self.triggers.module_path}/agentcore_endpoint_output.json') as f:
        data = json.load(f)
    print(data.get('agentRuntimeEndpointArn', ''))
except:
    print('')
" 2>/dev/null || echo "")

        if [ -n "$ENDPOINT_ARN" ]; then
          echo "Deleting endpoint: $ENDPOINT_ARN"
          aws bedrock-agent delete-agent-runtime-endpoint \
            --agent-runtime-endpoint-arn "$ENDPOINT_ARN" \
            --region "${self.triggers.region}" 2>/dev/null || true
        fi
      fi

      # Read runtime info
      if [ -f "${self.triggers.module_path}/agentcore_runtime_output.json" ]; then
        RUNTIME_ARN=$(python3 -c "
import json
try:
    with open('${self.triggers.module_path}/agentcore_runtime_output.json') as f:
        data = json.load(f)
    print(data.get('agentRuntimeArn', ''))
except:
    print('')
" 2>/dev/null || echo "")

        if [ -n "$RUNTIME_ARN" ]; then
          echo "Deleting runtime: $RUNTIME_ARN"
          aws bedrock-agent delete-agent-runtime \
            --agent-runtime-arn "$RUNTIME_ARN" \
            --region "${self.triggers.region}" 2>/dev/null || true
        fi
      fi

      # Clean up output files
      rm -f "${self.triggers.module_path}/agentcore_runtime_output.json"
      rm -f "${self.triggers.module_path}/agentcore_endpoint_output.json"
      rm -f "${self.triggers.module_path}/agentcore_list_output.json"

      echo "AgentCore cleanup complete."
    SCRIPT
  }
}

# ---------------------------------------------------------------------------
# Locals — derive the runtime ARN for use by other resources
# ---------------------------------------------------------------------------

locals {
  agentcore_runtime_arn = var.enable_agentcore ? "arn:${local.partition}:bedrock:${var.aws_region}:${local.account_id}:agent-runtime/${var.project_name}-runtime" : ""
}
