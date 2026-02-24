# Agent77

Self-hosted AI chatbot platform on AWS. Lets site owners deploy an AI chat widget that connects to their MCP server, with per-user JWT authentication.

## Architecture

```
agent77.app (CloudFront)
├── / ─────────────── S3 (Next.js static export)
├── /dashboard ────── S3 (auth-gated SPA, Cognito)
├── /api/* ─────────── API Gateway → Lambda (Hono, Node.js 20)
└── /widget.js ────── S3 (embeddable chatbot snippet)

AgentCore Runtime (container on ECR)
├── main.py ── strands Agent (simple assistant, used for dashboard test chat)
└── agent.py ── production agent (MCP client, Claude tool loop, JWT passthrough)
```

## Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS 4 — static export to S3
- **API**: Hono on Lambda (Node.js 20) behind API Gateway HTTP API
- **Auth**: Cognito (dashboard), customer's own JWT/OIDC (end-user chat)
- **Database**: DynamoDB single-table (PK/SK), pay-per-request
- **Agent**: Python 3.11 container on AWS Bedrock AgentCore Runtime
- **Model**: Claude via Bedrock (`anthropic.claude-sonnet-4-6`)
- **IaC**: Terraform (~> 6.0 AWS provider)
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`)

## Directory Structure

```
apps/api/           Lambda API (Hono)
  src/routes/
    auth.ts         Cognito OAuth callback, /me endpoint
    chat.ts         POST /api/chat → InvokeAgentRuntime (SDK stream)
    customers.ts    Config CRUD, snippet generation
  src/lib/
    auth.ts         JWT validation via Cognito JWKS
    agentcore.ts    SigV4 signing for AgentCore API
  src/db/
    queries.ts      DynamoDB operations

apps/web/           Next.js frontend (static export)
  src/app/
    page.tsx        Landing page (features, hero)
    login/          Cognito redirect
    dashboard/      Auth-gated config + test chat
    docs/           MDX documentation pages

packages/chatbot-snippet/   Embeddable JS widget (IIFE, Shadow DOM)

agent/
  main.py           Strands Agent entrypoint (BedrockAgentCoreApp)
  agent.py          Production agent (MCP client, Claude tool loop)
  Dockerfile        Python 3.11-slim, opentelemetry, non-root user
  requirements.txt  strands-agents, boto3, bedrock-agentcore

terraform/
  main.tf           Providers (aws ~>6.0, archive, null), backend, locals
  agentcore.tf      ECR + CodeBuild + AgentCore Runtime + IAM
  lambda.tf         Lambda + API Gateway HTTP API + IAM
  cognito.tf        User Pool + App Client + admin user
  dynamodb.tf       Config table (single-table design)
  s3_cloudfront.tf  S3 bucket + CloudFront + cache policies + SPA rewrite
  acm.tf            ACM cert for custom domain
  variables.tf      Input variables
  outputs.tf        URLs, resource IDs, deploy commands
  buildspec.yml     Docker build spec (ARM64)
  scripts/
    build-image.sh  Trigger CodeBuild, wait, verify ECR image
  bootstrap/
    main.tf         Optional S3 backend + DynamoDB lock table
```

## Key Terraform Variables

| Variable | Default | Purpose |
|---|---|---|
| `project_name` | `agent77` | Resource name prefix |
| `domain` | `""` | Custom domain (optional) |
| `admin_email` | (required) | Cognito admin user |
| `admin_password` | (required) | Cognito admin password |
| `agentcore_model_id` | `anthropic.claude-sonnet-4-6` | Bedrock model |
| `enable_agentcore` | `true` | Provision AgentCore |
| `agentcore_image_tag` | `latest` | Docker image tag |

## Build & Deploy

```bash
# Install
pnpm install

# Dev (all apps in parallel)
pnpm dev

# Build API
cd apps/api && pnpm build
cd dist && zip -r lambda.zip index.js

# Build frontend (needs env vars from terraform outputs)
cd apps/web && npx next build

# Deploy infrastructure
cd terraform && terraform init && terraform apply

# Deploy Lambda
aws lambda update-function-code --function-name agent77-api \
  --zip-file fileb://apps/api/dist/lambda.zip

# Deploy frontend
aws s3 sync apps/web/out s3://$(terraform output -raw frontend_bucket_name) --delete
aws cloudfront create-invalidation --distribution-id $(terraform output -raw cloudfront_distribution_id) --paths '/*'
```

Agent container is built/deployed automatically by Terraform via CodeBuild.

## Auth Flows

**Dashboard (Cognito):**
User → /login → Cognito hosted UI → OAuth callback → httpOnly cookie → /dashboard

**End-user chat (widget):**
Widget → site's token endpoint → JWT → AgentCore Runtime (validates via OIDC) → Agent → MCP server (JWT forwarded)

## How Chat Works

1. Dashboard sends `POST /api/chat {prompt}` to Lambda
2. Lambda calls `InvokeAgentRuntimeCommand` (AWS SDK, streams response)
3. AgentCore routes to container → `main.py` entrypoint
4. Agent processes prompt, calls Claude via Bedrock
5. Response streamed back: AgentCore → Lambda → frontend

For widget (direct): Widget → AgentCore Runtime URL → `agent.py` → MCP tools + Claude loop → response

## DynamoDB Schema

Single table `agent77-config`:
- `PK=CUSTOMER#{email}`, `SK=PROFILE` — user profile
- `PK=CUSTOMER#{email}`, `SK=MCP_CONFIG` — MCP server URLs, OIDC config

## Current State

- Infrastructure: fully deployed, working
- Dashboard: functional (login, config, test chat)
- AgentCore: container-based deploy (ECR + CodeBuild), Claude Sonnet 4.6
- Chat: working via dashboard test widget
- Widget: built but needs end-to-end testing with real MCP server
- No conversation history (each message is independent)
- No user identity passed to agent

## Conventions

- Terraform resources use `local.name_prefix` (`var.project_name`) as prefix
- `count = var.enable_agentcore ? 1 : 0` pattern for optional resources
- Lambda env vars: `AGENTCORE_ENDPOINT_ARN` holds the runtime ARN
- esbuild for all JS bundling (API + snippet)
- All API routes under `/api/*`, proxied by CloudFront to API Gateway
