#!/usr/bin/env bash
# Generate .env.local files for local development from terraform outputs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MAIN_TF_DIR="$ROOT_DIR/terraform"
DEMO_TF_DIR="$ROOT_DIR/demo/terraform"

echo "Reading main stack terraform outputs..."
cd "$MAIN_TF_DIR"
AGENTCORE_RUNTIME_URL=$(terraform output -raw agentcore_runtime_url 2>/dev/null || echo "")
AGENTCORE_MEMORY_ID=$(terraform output -raw agentcore_memory_id 2>/dev/null || echo "")
WIDGET_URL=$(terraform output -raw widget_url 2>/dev/null || echo "")

echo "Reading demo stack terraform outputs..."
cd "$DEMO_TF_DIR"
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
COGNITO_DOMAIN=$(terraform output -raw cognito_domain)
DEMO_URL=$(terraform output -raw demo_url)

# --- apps/api/.env.local ---
cat > "$ROOT_DIR/apps/api/.env.local" <<EOF
COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
COGNITO_DOMAIN=$COGNITO_DOMAIN
DASHBOARD_URL=http://localhost:3000
AGENTCORE_RUNTIME_URL=$AGENTCORE_RUNTIME_URL
AGENTCORE_MEMORY_ID=$AGENTCORE_MEMORY_ID
AWS_REGION_NAME=us-east-1
EOF
echo "Created apps/api/.env.local"

# --- apps/web/.env.local ---
CALLBACK_URL="http://localhost:3000/api/auth/callback"
cat > "$ROOT_DIR/apps/web/.env.local" <<EOF
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_COGNITO_DOMAIN=$COGNITO_DOMAIN
NEXT_PUBLIC_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
NEXT_PUBLIC_AUTH_CALLBACK_URL=$CALLBACK_URL
NEXT_PUBLIC_RUNTIME_URL=$AGENTCORE_RUNTIME_URL
NEXT_PUBLIC_WIDGET_URL=$WIDGET_URL
EOF
echo "Created apps/web/.env.local"

echo ""
echo "Local dev setup complete. Run:"
echo "  Terminal 1: cd apps/api && pnpm dev"
echo "  Terminal 2: cd apps/web && pnpm dev"
