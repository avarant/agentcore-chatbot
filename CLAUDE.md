# Agent77

Self-hosted AI chatbot platform on AWS. Lets site owners deploy an AI chat widget that connects to their MCP server, with per-user JWT authentication.

## Architecture

```
Main Stack (terraform/) — AgentCore only
├── ECR repository + CodeBuild (Docker image)
├── AgentCore Runtime (container-based agent)
└── AgentCore Memory (conversation persistence)

Demo Stack (demo/terraform/) — Full dashboard + demo
├── Cognito ────────── User pool + OAuth client
├── CloudFront + S3 ── Next.js static export + widget.js
├── Lambda Function URL ── API (Hono, apps/api)
└── /api/* ─────────── auth, token, conversations

AgentCore Runtime (container on ECR)
├── main.py ── strands Agent (simple assistant)
└── agent.py ── production agent (MCP client, Claude tool loop, JWT passthrough)
```

## Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS 4 — static export to S3
- **API**: Hono on Lambda (Node.js 20) via Lambda Function URL behind CloudFront
- **Auth**: Cognito (demo stack), customer's own JWT/OIDC (end-user chat via `oidc_discovery_url`)
- **Agent**: Python 3.11 container on AWS Bedrock AgentCore Runtime
- **Model**: Claude via Bedrock (`anthropic.claude-sonnet-4-6`)
- **IaC**: Terraform (~> 6.0 AWS provider)
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`)

## Directory Structure

```
apps/api/           Lambda API (Hono)
  src/routes/
    auth.ts         Cognito OAuth callback, /me, /token (GET+POST) endpoints
    conversations.ts  Conversation history (list sessions, view messages)
  src/lib/
    auth.ts         JWT validation via Cognito JWKS

apps/web/           Next.js frontend (static export)
  src/app/
    page.tsx        Landing page (features, hero)
    login/          Cognito redirect
    dashboard/      Auth-gated: widget demo, snippet, conversation history
    docs/           MDX documentation pages

packages/chatbot-snippet/   Embeddable JS widget (IIFE, Shadow DOM)

agent/
  main.py           Strands Agent entrypoint (BedrockAgentCoreApp)
  agent.py          Production agent (MCP client, Claude tool loop)
  Dockerfile        Python 3.11-slim, opentelemetry, non-root user
  requirements.txt  strands-agents, boto3, bedrock-agentcore

terraform/          AgentCore-only stack
  main.tf           Provider (aws ~>6.0, archive, null), backend, locals
  agentcore.tf      ECR + CodeBuild + AgentCore Runtime + Memory + IAM
  variables.tf      Input variables (incl. oidc_discovery_url, oidc_allowed_audience)
  outputs.tf        AgentCore URLs, resource IDs
  buildspec.yml     Docker build spec (ARM64)
  scripts/
    build-image.sh  Trigger CodeBuild, wait, verify ECR image
  bootstrap/
    main.tf         Optional S3 backend + DynamoDB lock table

demo/terraform/     Full dashboard + demo stack
  main.tf           Providers, backend
  cognito.tf        Cognito user pool + client (+ null_resource for callback URLs)
  s3_cloudfront.tf  S3 + CloudFront (SPA routing, /api/* → Lambda)
  lambda.tf         API Lambda (apps/api) + Function URL + IAM (memory read)
  variables.tf      region, project_name, domain, agentcore_runtime_url, agentcore_memory_id
  outputs.tf        URLs, deploy commands, OIDC discovery URL
```

## Key Terraform Variables

### Main stack (terraform/)

| Variable | Default | Purpose |
|---|---|---|
| `project_name` | `agent77` | Resource name prefix |
| `agentcore_model_id` | `anthropic.claude-sonnet-4-6` | Bedrock model |
| `enable_agentcore` | `true` | Provision AgentCore |
| `agentcore_image_tag` | `latest` | Docker image tag |
| `oidc_discovery_url` | `""` | OIDC discovery URL for AgentCore JWT validation |
| `oidc_allowed_audience` | `""` | Allowed audience (client ID) for OIDC validation |

### Demo stack (demo/terraform/)

| Variable | Default | Purpose |
|---|---|---|
| `project_name` | `agent77` | Resource name prefix |
| `domain` | `""` | Custom domain (optional) |
| `agentcore_runtime_url` | (required) | AgentCore runtime URL from main stack |
| `agentcore_memory_id` | (required) | AgentCore Memory ID from main stack |

## Build & Deploy

```bash
# 1. Install
pnpm install

# 2. Deploy main stack (AgentCore only)
cd terraform && terraform init && terraform apply
# Outputs: agentcore_runtime_url, agentcore_memory_id

# 3. Build API
cd apps/api && pnpm build

# 4. Build frontend
cd apps/web
NEXT_PUBLIC_API_URL="" \
NEXT_PUBLIC_COGNITO_DOMAIN=<from demo terraform output: cognito_domain> \
NEXT_PUBLIC_COGNITO_CLIENT_ID=<from demo terraform output: cognito_client_id> \
NEXT_PUBLIC_AUTH_CALLBACK_URL=<demo_url>/api/auth/callback \
NEXT_PUBLIC_RUNTIME_URL=<agentcore_runtime_url> \
NEXT_PUBLIC_DASHBOARD_URL=<demo_url> \
npx next build

# 5. Build widget
cd packages/chatbot-snippet && npm run build

# 6. Deploy demo stack
cd demo/terraform && terraform init && terraform apply \
  -var='agentcore_runtime_url=<from main output>' \
  -var='agentcore_memory_id=<from main output>'

# 7. Upload frontend + widget to demo S3
cd demo/terraform && eval $(terraform output -raw deploy_frontend_command)
```

Agent container is built/deployed automatically by Terraform via CodeBuild.

## Auth Flows

**Dashboard (demo Cognito):**
User → /login → Cognito hosted UI → /api/auth/callback → httpOnly cookie → /dashboard (widget auto-loads)

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

## Conversation Memory

- **AgentCore Memory**: managed service for persisting conversations across sessions
- Terraform resources: `aws_bedrockagentcore_memory` + `aws_bedrockagentcore_memory_strategy` (SUMMARIZATION)
- Agent uses `AgentCoreMemorySessionManager` from `bedrock_agentcore.memory` (Strands SDK integration)
- `session_id` and `user_id` passed in request body from widget
- **Actor ID constraint**: AgentCore requires `[a-zA-Z0-9][a-zA-Z0-9-_/]*` — emails must be sanitized (replace `@`/`.` with `_`)
- Conversation history API: `GET /api/conversations` (list sessions), `GET /api/conversations/:sessionId` (view messages)

## Current State

- Infrastructure: fully deployed, working
- Dashboard: functional (login, live widget demo, snippet generation, conversation history)
- AgentCore: container-based deploy (ECR + CodeBuild), Claude Sonnet 4.6
- Auth: AgentCore validates JWTs via configurable OIDC (`oidc_discovery_url` variable)
- Memory: conversation persistence across turns via AgentCore Memory
- Widget: working, parses JSON responses from AgentCore
- MCP integration: built but needs end-to-end testing with a real MCP server

## Conventions

- Terraform resources use `local.name_prefix` (`var.project_name`) as prefix
- `count = var.enable_agentcore ? 1 : 0` pattern for optional resources in main stack
- Lambda env vars: `AGENTCORE_RUNTIME_URL` (direct HTTP URL), `AGENTCORE_MEMORY_ID`, `DASHBOARD_URL`
- esbuild for all JS bundling (API + snippet), with `--external:@aws-sdk/*`
- All API routes under `/api/*`, proxied by CloudFront to Lambda Function URL
- AgentCore `authorizer_configuration` uses dynamic block — only added when `oidc_discovery_url` is set
- Demo Lambda derives `DASHBOARD_URL` from env var (set via null_resource after CloudFront deploys)
- `.gitignore` uses `**` glob patterns for terraform files (covers both `terraform/` and `demo/terraform/`)
