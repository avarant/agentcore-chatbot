#!/usr/bin/env bash
set -euo pipefail

# Deploy the chatbot widget to CDN
# Usage: ./scripts/deploy-widget.sh

cd "$(dirname "$0")/.."

echo "Building widget..."
cd packages/chatbot-snippet && npm run build && cd ../..

echo "Deploying to S3 + invalidating CloudFront..."
eval "$(cd terraform && terraform output -raw deploy_widget_command)"

echo "Widget deployed."
