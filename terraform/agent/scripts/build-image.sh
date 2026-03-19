#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# build-image.sh — Start CodeBuild, wait for completion, verify ECR image
###############################################################################

PROJECT_NAME="${1:?Usage: build-image.sh <codebuild-project> <ecr-repo-url> <image-tag> <region>}"
ECR_REPO_URI="${2:?}"
IMAGE_TAG="${3:?}"
REGION="${4:?}"

echo "Starting CodeBuild project: ${PROJECT_NAME}"
BUILD_ID=$(aws codebuild start-build \
  --project-name "${PROJECT_NAME}" \
  --region "${REGION}" \
  --query 'build.id' \
  --output text)

echo "Build started: ${BUILD_ID}"
echo "Waiting for build to complete..."

# Poll for build completion
while true; do
  STATUS=$(aws codebuild batch-get-builds \
    --ids "${BUILD_ID}" \
    --region "${REGION}" \
    --query 'builds[0].buildStatus' \
    --output text)

  case "${STATUS}" in
    SUCCEEDED)
      echo "Build succeeded!"
      break
      ;;
    FAILED|FAULT|STOPPED|TIMED_OUT)
      echo "Build failed with status: ${STATUS}"
      # Print build logs URL for debugging
      LOG_URL=$(aws codebuild batch-get-builds \
        --ids "${BUILD_ID}" \
        --region "${REGION}" \
        --query 'builds[0].logs.deepLink' \
        --output text)
      echo "Build logs: ${LOG_URL}"
      exit 1
      ;;
    *)
      echo "  Status: ${STATUS} — waiting 15s..."
      sleep 15
      ;;
  esac
done

# Verify image exists in ECR
REPO_NAME=$(echo "${ECR_REPO_URI}" | cut -d'/' -f2)
echo "Verifying image ${REPO_NAME}:${IMAGE_TAG} in ECR..."

aws ecr describe-images \
  --repository-name "${REPO_NAME}" \
  --image-ids imageTag="${IMAGE_TAG}" \
  --region "${REGION}" \
  --query 'imageDetails[0].imageSizeInBytes' \
  --output text > /dev/null

echo "Image verified in ECR. Done."
