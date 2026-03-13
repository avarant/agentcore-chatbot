#!/usr/bin/env bash
set -euo pipefail

# Deploy dashboard API (Lambda) and optionally the frontend
# Usage: ./scripts/deploy-dashboard.sh [--frontend]

cd "$(dirname "$0")/.."

DEPLOY_FRONTEND=false
if [[ "${1:-}" == "--frontend" ]]; then
  DEPLOY_FRONTEND=true
fi

# Always deploy API Lambda
echo "Building dashboard API..."
cd apps/api && pnpm build && cd ../..

echo "Deploying Lambda..."
cd terraform && terraform apply \
  -target=aws_lambda_function.dashboard \
  -auto-approve > /dev/null 2>&1
cd ..

echo "Dashboard API deployed."

if $DEPLOY_FRONTEND; then
  echo "Building frontend..."
  cd apps/web

  NEXT_PUBLIC_API_URL="" \
  NEXT_PUBLIC_COGNITO_DOMAIN="$(cd ../../terraform && terraform output -raw dashboard_cognito_domain)" \
  NEXT_PUBLIC_COGNITO_CLIENT_ID="$(cd ../../terraform && terraform output -raw dashboard_cognito_client_id)" \
  NEXT_PUBLIC_AUTH_CALLBACK_URL="$(cd ../../terraform && terraform output -raw dashboard_url)/api/auth/callback" \
  NEXT_PUBLIC_RUNTIME_URL="$(cd ../../terraform && terraform output -raw agentcore_runtime_url)" \
  NEXT_PUBLIC_WIDGET_URL="$(cd ../../terraform && terraform output -raw widget_url)" \
  npx next build

  cd ../..

  echo "Uploading frontend to S3..."
  eval "$(cd terraform && terraform output -raw deploy_dashboard_frontend_command)"

  echo "Dashboard frontend deployed."
fi
