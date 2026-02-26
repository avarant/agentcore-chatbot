# Agent77

Self-hosted AI chatbot platform on AWS. Lets site owners deploy an AI chat widget that connects to their MCP server, with per-user JWT authentication.

## Architecture

```
Dashboard (CloudFront — demo.agent77.app)
├── / ─────────────── S3 (Next.js static export)
├── /dashboard ────── S3 (auth-gated SPA, Cognito)
├── /api/* ─────────── API Gateway → Lambda (Hono, Node.js 20)
└── /snippet.js ────── S3 (embeddable chatbot widget)

Demo Site (CloudFront — separate distribution)
├── / ─────────────── S3 (static HTML with widget embed)
└── /api/* ─────────── Lambda Function URL (auth + token endpoint)

AgentCore Runtime (container on ECR)
├── main.py ── strands Agent (simple assistant)
└── agent.py ── production agent (MCP client, Claude tool loop, JWT passthrough)
```

## Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS 4 — static export to S3
- **API**: Hono on Lambda (Node.js 20) behind API Gateway HTTP API
- **Auth**: Cognito (dashboard), customer's own JWT/OIDC (end-user chat via `oidc_discovery_url`)
- **Database**: DynamoDB single-table (PK/SK), pay-per-request
- **Agent**: Python 3.11 container on AWS Bedrock AgentCore Runtime
- **Model**: Claude via Bedrock (`anthropic.claude-sonnet-4-6`)
- **IaC**: Terraform (~> 6.0 AWS provider)
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`)

## Directory Structure

```
apps/api/           Lambda API (Hono)
  src/routes/
    auth.ts         Cognito OAuth callback, /me, /token endpoints
    customers.ts    Config CRUD, snippet generation (includes data-token-url)
    conversations.ts  Conversation history (list sessions, view messages)
  src/lib/
    auth.ts         JWT validation via Cognito JWKS
  src/db/
    queries.ts      DynamoDB operations

apps/web/           Next.js frontend (static export)
  src/app/
    page.tsx        Landing page (features, hero)
    login/          Cognito redirect
    dashboard/      Auth-gated config + snippet (no chat widget)
    docs/           MDX documentation pages

packages/chatbot-snippet/   Embeddable JS widget (IIFE, Shadow DOM)

agent/
  main.py           Strands Agent entrypoint (BedrockAgentCoreApp)
  agent.py          Production agent (MCP client, Claude tool loop)
  Dockerfile        Python 3.11-slim, opentelemetry, non-root user
  requirements.txt  strands-agents, boto3, bedrock-agentcore

terraform/
  main.tf           Providers (aws ~>6.0, archive, null), backend, locals
  agentcore.tf      ECR + CodeBuild + AgentCore Runtime + Memory + IAM
  lambda.tf         Lambda + API Gateway HTTP API + IAM
  cognito.tf        User Pool + App Client + admin user
  dynamodb.tf       Config table (single-table design)
  s3_cloudfront.tf  S3 bucket + CloudFront + cache policies + SPA rewrite
  acm.tf            ACM cert for custom domain
  variables.tf      Input variables (incl. oidc_discovery_url, oidc_allowed_audience)
  outputs.tf        URLs, resource IDs, deploy commands
  buildspec.yml     Docker build spec (ARM64)
  scripts/
    build-image.sh  Trigger CodeBuild, wait, verify ECR image
  bootstrap/
    main.tf         Optional S3 backend + DynamoDB lock table

demo/               Standalone demo app (separate Cognito + infrastructure)
  terraform/
    main.tf         Providers, backend
    cognito.tf      Demo Cognito user pool + client (+ null_resource for callback URLs)
    s3_cloudfront.tf  S3 + CloudFront for static site
    lambda.tf       Token endpoint Lambda + Function URL
    variables.tf    region, project_name, domain, agentcore_runtime_url, widget_url
    outputs.tf      oidc_discovery_url, demo_url, cognito_client_id
  app/
    index.html      Simple page with chatbot widget (templatefile with runtime_url, widget_url)
  api/
    src/index.ts    Hono: /api/auth/login, /api/auth/callback, /api/auth/me, /api/chatbot-token, /api/auth/logout
    package.json    Dependencies (hono, esbuild)
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
| `oidc_discovery_url` | `""` | OIDC discovery URL for AgentCore JWT validation |
| `oidc_allowed_audience` | `""` | Allowed audience (client ID) for OIDC validation |

## Build & Deploy

### Deploy flow (demo + main stack)

```bash
# 1. Install
pnpm install

# 2. Build demo API
cd demo/api && npm install && npm run build && cd ../..

# 3. Deploy demo stack (creates Cognito pool for demo users)
cd demo/terraform && terraform init && terraform apply \
  -var='agentcore_runtime_url=<from main stack>' \
  -var='widget_url=<dashboard_url>/snippet.js'
# Outputs: oidc_discovery_url, cognito_client_id

# 4. Set OIDC vars in main stack terraform.tfvars:
#   oidc_discovery_url    = "<from demo output>"
#   oidc_allowed_audience = "<from demo output>"

# 5. Deploy main stack
cd terraform && terraform init && terraform apply

# 6. Build and deploy API Lambda
cd apps/api && pnpm build
cd dist && zip -r lambda.zip index.js
aws lambda update-function-code --function-name agent77-api \
  --zip-file fileb://apps/api/dist/lambda.zip

# 7. Build and deploy frontend (use production env vars, not .env.local)
cd apps/web
NEXT_PUBLIC_API_URL=$(cd ../../terraform && terraform output -raw dashboard_url) \
NEXT_PUBLIC_COGNITO_DOMAIN=$(cd ../../terraform && terraform output -raw cognito_domain) \
NEXT_PUBLIC_COGNITO_CLIENT_ID=$(cd ../../terraform && terraform output -raw cognito_client_id) \
NEXT_PUBLIC_AUTH_CALLBACK_URL=$(cd ../../terraform && terraform output -raw dashboard_url)/api/auth/callback \
npx next build

# 8. Upload frontend + widget to S3
cd terraform && eval $(terraform output -raw deploy_frontend_command)
aws s3 cp packages/chatbot-snippet/dist/chatbot.js \
  s3://$(terraform output -raw frontend_bucket_name)/snippet.js \
  --content-type 'application/javascript'
```

Agent container is built/deployed automatically by Terraform via CodeBuild.

## Auth Flows

**Dashboard (Cognito):**
User → /login → Cognito hosted UI → OAuth callback → httpOnly cookie → /dashboard

**Demo site (demo Cognito):**
User → /api/auth/login → demo Cognito hosted UI → /api/auth/callback → httpOnly cookie → widget loads → /api/chatbot-token returns JWT → widget calls AgentCore

**End-user chat (widget on customer site):**
Widget → customer's token endpoint → JWT → AgentCore Runtime (validates via `oidc_discovery_url`) → `agent.py` → MCP tools + Claude loop → response

## How Chat Works

The widget calls AgentCore directly (no Lambda proxy):

1. Widget fetches JWT from token endpoint (`data-token-url` attribute)
2. Widget POSTs to AgentCore runtime URL with `Authorization: Bearer <jwt>` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` header
3. AgentCore validates JWT against OIDC discovery URL (configured via `oidc_discovery_url` terraform variable)
4. AgentCore routes to container → `agent.py` (MCP client)
5. Agent processes prompt via Claude, with conversation memory via `AgentCoreMemorySessionManager`
6. Response streamed back as JSON (`{"status": "success", "response": "..."}`)
7. Widget parses JSON and displays the `response` field

## DynamoDB Schema

Single table `agent77-config`:
- `PK=CUSTOMER#{email}`, `SK=PROFILE` — user profile
- `PK=CUSTOMER#{email}`, `SK=MCP_CONFIG` — MCP server URLs, OIDC config

## Conversation Memory

- **AgentCore Memory**: managed service for persisting conversations across sessions
- Terraform resources: `aws_bedrockagentcore_memory` + `aws_bedrockagentcore_memory_strategy` (SUMMARIZATION)
- Agent uses `AgentCoreMemorySessionManager` from `bedrock_agentcore.memory` (Strands SDK integration)
- `session_id` and `user_id` passed in request body from widget
- **Actor ID constraint**: AgentCore requires `[a-zA-Z0-9][a-zA-Z0-9-_/]*` — emails must be sanitized (replace `@`/`.` with `_`)
- Conversation history API: `GET /api/conversations` (list sessions), `GET /api/conversations/:sessionId` (view messages)

## Current State

- Infrastructure: fully deployed, working (demo.agent77.app + demo CloudFront)
- Dashboard: functional (login, config form, snippet generation, conversation history — no chat widget)
- Demo site: functional (login via demo Cognito, widget loads, chat works end-to-end)
- AgentCore: container-based deploy (ECR + CodeBuild), Claude Sonnet 4.6
- Auth: AgentCore validates JWTs via configurable OIDC (`oidc_discovery_url` variable)
- Memory: conversation persistence across turns via AgentCore Memory
- Widget: working, parses JSON responses from AgentCore
- MCP integration: built but needs end-to-end testing with a real MCP server

## Conventions

- Terraform resources use `local.name_prefix` (`var.project_name`) as prefix
- `count = var.enable_agentcore ? 1 : 0` pattern for optional resources
- Lambda env vars: `AGENTCORE_RUNTIME_URL` (direct HTTP URL), `AGENTCORE_MEMORY_ID`
- esbuild for all JS bundling (API + snippet + demo API), with `--external:@aws-sdk/*`
- All API routes under `/api/*`, proxied by CloudFront to API Gateway
- AgentCore `authorizer_configuration` uses dynamic block — only added when `oidc_discovery_url` is set
- Demo API uses CJS format (`--format=cjs`) for Lambda Node.js 20 compatibility
- Demo Lambda derives `DEMO_URL` from env var (set via null_resource after CloudFront deploys)
- `.gitignore` uses `**` glob patterns for terraform files (covers both `terraform/` and `demo/terraform/`)
