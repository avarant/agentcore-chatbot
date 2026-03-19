#!/usr/bin/env bash
set -euo pipefail

# Deploy dashboard API (Lambda) and optionally the frontend
# Usage: ./scripts/deploy-dashboard.sh [--frontend]
#
# Uses terraform/dashboard/ if it has a terraform.tfvars file,
# otherwise falls back to the legacy terraform/ directory.

cd "$(dirname "$0")/.."

DEPLOY_FRONTEND=false
if [[ "${1:-}" == "--frontend" ]]; then
  DEPLOY_FRONTEND=true
fi

# Select terraform directory
if [[ -f "terraform/dashboard/terraform.tfvars" ]]; then
  TF_DIR="terraform/dashboard"
else
  TF_DIR="terraform"
fi

# Always deploy API Lambda
echo "Building dashboard API..."
cd apps/api && pnpm build && cd ../..

echo "Deploying Lambda (from $TF_DIR)..."
cd "$TF_DIR" && terraform apply \
  -target=aws_lambda_function.dashboard \
  -auto-approve > /dev/null 2>&1
cd - > /dev/null

echo "Dashboard API deployed."

if $DEPLOY_FRONTEND; then
  echo "Building frontend..."
  cd apps/web

  NEXT_PUBLIC_API_URL="" \
  NEXT_PUBLIC_COGNITO_DOMAIN="$(cd "../../$TF_DIR" && terraform output -raw dashboard_cognito_domain)" \
  NEXT_PUBLIC_COGNITO_CLIENT_ID="$(cd "../../$TF_DIR" && terraform output -raw dashboard_cognito_client_id)" \
  NEXT_PUBLIC_AUTH_CALLBACK_URL="$(cd "../../$TF_DIR" && terraform output -raw dashboard_url)/api/auth/callback" \
  npx next build

  cd ../..

  echo "Uploading frontend to S3..."
  # New dashboard stack uses deploy_frontend_command; legacy stack uses deploy_dashboard_frontend_command
  DEPLOY_CMD=$(cd "$TF_DIR" && terraform output -raw deploy_frontend_command 2>/dev/null || terraform output -raw deploy_dashboard_frontend_command)
  eval "$DEPLOY_CMD"

  echo "Dashboard frontend deployed."
fi
