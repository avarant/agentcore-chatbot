#!/usr/bin/env bash
set -euo pipefail

# Build agent container, tag with unique ID, and deploy via terraform
# Usage: ./scripts/deploy-agent.sh

cd "$(dirname "$0")/.."

REGION="us-east-1"
PROJECT_NAME="agent77-agent-build"
ECR_REPO="agent77-agent"

echo "Starting CodeBuild..."
BUILD_ID=$(aws codebuild start-build \
  --project-name "$PROJECT_NAME" \
  --region "$REGION" \
  --query 'build.id' --output text)

echo "Build: $BUILD_ID"
echo "Waiting for build to complete..."

while true; do
  STATUS=$(aws codebuild batch-get-builds \
    --ids "$BUILD_ID" --region "$REGION" \
    --query 'builds[0].buildStatus' --output text)
  case "$STATUS" in
    SUCCEEDED) echo "Build succeeded!"; break ;;
    FAILED|FAULT|STOPPED|TIMED_OUT) echo "Build failed: $STATUS"; exit 1 ;;
    *) echo "  $STATUS — waiting 15s..."; sleep 15 ;;
  esac
done

# Tag with unique deploy ID
TAG="deploy-$(date +%s)"
echo "Tagging image as $TAG..."
MANIFEST=$(aws ecr batch-get-image \
  --repository-name "$ECR_REPO" --region "$REGION" \
  --image-ids imageTag=latest \
  --query 'images[0].imageManifest' --output text)
aws ecr put-image \
  --repository-name "$ECR_REPO" --region "$REGION" \
  --image-tag "$TAG" --image-manifest "$MANIFEST" > /dev/null

# Update terraform.tfvars with new tag
echo "Updating terraform.tfvars with tag: $TAG"
sed -i '' "s/agentcore_image_tag = \".*\"/agentcore_image_tag = \"$TAG\"/" terraform/terraform.tfvars

# Apply via terraform (preserves env vars + authorizer)
echo "Applying terraform..."
cd terraform && terraform apply \
  -target=aws_bedrockagentcore_agent_runtime.main \
  -auto-approve > /dev/null 2>&1

echo "Agent deployed with tag: $TAG"
