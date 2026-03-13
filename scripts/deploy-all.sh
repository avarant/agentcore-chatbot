#!/usr/bin/env bash
set -euo pipefail

# Deploy everything: widget, agent, and dashboard API
# Usage: ./scripts/deploy-all.sh [--frontend]

cd "$(dirname "$0")/.."

echo "=== Deploying widget ==="
./scripts/deploy-widget.sh

echo ""
echo "=== Deploying agent ==="
./scripts/deploy-agent.sh

echo ""
echo "=== Deploying dashboard ==="
./scripts/deploy-dashboard.sh "$@"

echo ""
echo "All deployments complete."
