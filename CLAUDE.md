# Agent77

Self-hosted AI chatbot platform on AWS. Lets site owners deploy an AI chat widget that connects to their MCP server, with per-user JWT authentication.

## Architecture

```
Main Stack (terraform/) — AgentCore + Widget CDN + optional Dashboard + optional KB
├── ECR repository + CodeBuild (Docker image)
├── AgentCore Runtime (container-based agent)
├── AgentCore Memory (conversation persistence)
├── S3 + CloudFront ── widget.js CDN (CORS-enabled)
├── [optional] Lambda Function URL ── Dashboard API (Hono, apps/api)
├── [optional] Cognito + S3 + CloudFront ── Dashboard UI
└── [optional] Bedrock Knowledge Base + S3 Vectors + S3 docs bucket

Demo Stack (demo/terraform/) — Full dashboard + demo
├── Cognito ────────── User pool + OAuth client
├── CloudFront + S3 ── Next.js static export
├── Lambda Function URL ── API (Hono, apps/api)
└── /api/* ─────────── auth, token, conversations

AgentCore Runtime (container on ECR)
├── main.py ── strands Agent (simple assistant, optional KB retrieve tool)
└── agent.py ── production agent (MCP client, Claude tool loop, JWT passthrough)
```

## Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS 4 — static export to S3
- **API**: Hono on Lambda (Node.js 20) via Lambda Function URL behind CloudFront
- **Auth**: Cognito (demo/dashboard UI), API key (programmatic), customer's own JWT/OIDC (end-user chat via `oidc_discovery_url`)
- **Agent**: Python 3.11 container on AWS Bedrock AgentCore Runtime
- **Model**: Claude via Bedrock (`anthropic.claude-sonnet-4-6`)
- **IaC**: Terraform (~> 6.0 AWS provider)
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`)

## Directory Structure

```
apps/api/           Lambda API (Hono)
  src/routes/
    auth.ts         Cognito OAuth callback, /me, /token (GET+POST) — derives dashboard URL from X-Forwarded-Host
    conversations.ts  Conversation history (list sessions, view messages) — supports API key + Cognito auth
    documents.ts    KB document upload (presigned URLs), list, delete, sync — gated on KB_DOCS_BUCKET env var
  src/lib/
    auth.ts         dashboardAuth middleware (API key → Cognito JWT fallback), validateJwt
  src/types.ts      Env type (optional Cognito bindings, KB bindings, authMode variable)

apps/web/           Next.js frontend (static export)
  src/app/
    page.tsx        Landing page (features, hero)
    login/          Cognito redirect
    dashboard/      Auth-gated: widget demo, snippet, conversation history, documents
    docs/           MDX documentation pages

packages/chatbot-snippet/   Embeddable JS widget (IIFE, Shadow DOM, SSE streaming, markdown)

scripts/                    Deploy scripts
  deploy-all.sh             Deploy widget + agent + dashboard
  deploy-agent.sh           CodeBuild → unique tag → terraform apply
  deploy-dashboard.sh       Build API + deploy Lambda, --frontend for UI
  deploy-widget.sh          Build widget → S3 + CloudFront invalidation

docs/
  getting-started.md  Full setup walkthrough
  authentication.md   OIDC/JWT auth setup
  local-development.md  Local dev environment

agent/
  main.py           Strands Agent entrypoint (BedrockAgentCoreApp, optional KB retrieve tool)
  agent.py          Production agent (MCP client, Claude tool loop)
  Dockerfile        Python 3.11-slim, opentelemetry, non-root user
  requirements.txt  strands-agents, strands-agents-tools, boto3, bedrock-agentcore

terraform/          Main stack (AgentCore + optional dashboard)
  main.tf           Provider (aws ~>6.0, archive, null), backend, locals
  agentcore.tf      ECR + CodeBuild + AgentCore Runtime + Memory + Prompt + IAM
  widget.tf         S3 + CloudFront CDN for embeddable widget (CORS)
  dashboard.tf      [optional] Lambda API + Function URL (gated on enable_dashboard)
  dashboard_ui.tf   [optional] Cognito + S3 + CloudFront + CF Functions (gated on enable_dashboard_ui)
  knowledge_base.tf [optional] Bedrock KB + S3 Vectors + S3 docs bucket (gated on enable_knowledge_base)
  variables.tf      Input variables (incl. dashboard, oidc, KB vars)
  outputs.tf        AgentCore URLs, resource IDs, widget CDN URL, dashboard outputs, KB outputs
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
| `agentcore_image_tag` | `latest` | Docker image tag (use unique tags like `deploy-<timestamp>` to force re-pull) |
| `agent_system_prompt` | `"You are a helpful assistant..."` | System prompt managed via Bedrock Prompt Management |
| `oidc_discovery_url` | `""` | OIDC discovery URL for AgentCore JWT validation |
| `oidc_allowed_audience` | `""` | Allowed audience (client ID) for OIDC validation |
| `enable_dashboard` | `false` | Provision dashboard API (Lambda + Function URL) |
| `enable_dashboard_ui` | `false` | Provision dashboard UI (Cognito + S3 + CloudFront), requires `enable_dashboard` |
| `dashboard_api_key` | `""` | API key for `X-API-Key` header auth (sensitive) |
| `dashboard_domain` | `""` | Custom domain for dashboard CloudFront |
| `enable_knowledge_base` | `false` | Provision Bedrock Knowledge Base with S3 Vectors for document retrieval |

### Demo stack (demo/terraform/)

| Variable | Default | Purpose |
|---|---|---|
| `project_name` | `agent77` | Resource name prefix |
| `domain` | `""` | Custom domain (optional) |
| `agentcore_runtime_url` | (required) | AgentCore runtime URL from main stack |
| `agentcore_memory_id` | (required) | AgentCore Memory ID from main stack |

## Build & Deploy

### Deploy scripts (recommended)

```bash
# Deploy everything (widget + agent + dashboard API)
./scripts/deploy-all.sh

# Deploy everything including dashboard frontend
./scripts/deploy-all.sh --frontend

# Deploy individual components
./scripts/deploy-widget.sh        # Build widget → S3 + CloudFront invalidation
./scripts/deploy-agent.sh         # CodeBuild → unique tag → terraform apply
./scripts/deploy-dashboard.sh     # Build API → deploy Lambda
./scripts/deploy-dashboard.sh --frontend  # + build/upload frontend
```

### Manual deploy

```bash
# 1. Install
pnpm install

# 2. Deploy main stack (AgentCore + widget CDN)
cd terraform && terraform init && terraform apply
# Outputs: agentcore_runtime_url, agentcore_memory_id, widget_url

# 3. Deploy demo stack
cd demo/terraform && terraform init && terraform apply \
  -var='agentcore_runtime_url=<from main output>' \
  -var='agentcore_memory_id=<from main output>'
```

### Agent deploy pattern

**Important**: AgentCore caches Docker images by tag. Using `latest` won't force a re-pull. The deploy script (`scripts/deploy-agent.sh`) handles this by:
1. Triggering CodeBuild to build the image
2. Tagging with a unique ID (`deploy-<timestamp>`)
3. Updating `terraform/terraform.tfvars` with the new tag
4. Running `terraform apply` to update the runtime

**Never use `aws bedrockagentcore update-agent-runtime` CLI** — it wipes all unspecified config (env vars, authorizer). Always use `terraform apply`.

## Auth Flows

**Dashboard (Cognito — demo or main stack UI):**
User → /login → Cognito hosted UI → /api/auth/callback → httpOnly cookie → /dashboard (widget auto-loads)

**Dashboard API (API key):**
Client → `X-API-Key` header → Lambda validates against `DASHBOARD_API_KEY` env var → conversations (requires `user_id` query param)

**End-user chat (widget on customer site):**
Widget → customer's token endpoint → JWT → AgentCore Runtime (validates via `oidc_discovery_url`) → `agent.py` → MCP tools + Claude loop → response

## How Chat Works

The widget calls AgentCore directly (no Lambda proxy):

1. Widget fetches JWT from token endpoint (`data-token-url` attribute)
2. Widget POSTs to AgentCore runtime URL with `Authorization: Bearer <jwt>` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` header
3. AgentCore validates JWT against OIDC discovery URL (configured via `oidc_discovery_url` terraform variable)
4. AgentCore passes the `Authorization` header through to the container (requires `request_header_configuration` in `agentcore.tf`)
5. Agent extracts user identity from the JWT server-side via `context.request_headers` (decodes the token to get email/sub claim)
6. Agent processes prompt via Claude, with conversation memory via `AgentCoreMemorySessionManager` (actor_id = sanitized email)
7. Response streamed back as SSE (`data: {"chunk": "..."}` lines)
8. Widget parses SSE stream and renders markdown incrementally

## Conversation Memory

- **AgentCore Memory**: managed service for persisting conversations across sessions
- Terraform resources: `aws_bedrockagentcore_memory` + `aws_bedrockagentcore_memory_strategy` (SUMMARIZATION)
- Agent uses `AgentCoreMemorySessionManager` from `bedrock_agentcore.memory` (Strands SDK integration)
- **Actor ID**: extracted server-side from JWT (email or sub claim) — never passed from client
- **Actor ID constraint**: AgentCore requires `[a-zA-Z0-9][a-zA-Z0-9-_/]*` — emails must be sanitized (replace `@`/`.` with `_`)
- **Conversation history API**: `GET /api/conversations` lists all actors via `ListActorsCommand` then all sessions (admin view), `GET /api/conversations/:sessionId` views messages

## Knowledge Base (Document Retrieval)

Optional feature gated on `enable_knowledge_base = true`. Lets users upload documents through the dashboard, auto-embed them via Bedrock, and make them available to the agent.

**Flow:** Dashboard upload → S3 presigned URL → S3 docs bucket → Bedrock ingestion job → S3 Vectors (embeddings) → agent `retrieve` tool → grounded answers

**Infrastructure** (`terraform/knowledge_base.tf`):
- S3 bucket for document uploads (`${name_prefix}-kb-docs-${account_id}`)
- S3 Vectors: vector bucket + index (float32, 1024 dims, cosine distance, Titan Embed V2)
- Bedrock Knowledge Base (VECTOR type) with S3 data source (fixed-size chunking: 512 tokens, 20% overlap)
- IAM role for Bedrock KB service (S3 read, S3 Vectors access, embedding model invoke)

**Agent** (`agent/main.py`):
- Uses `retrieve` tool from `strands-agents-tools` when `KNOWLEDGE_BASE_ID` env var is set
- Tool reads `KNOWLEDGE_BASE_ID` and `AWS_REGION` automatically

**Dashboard API** (`apps/api/src/routes/documents.ts`):
- `GET /api/documents` — list documents in S3 bucket
- `POST /api/documents/upload` — generate presigned S3 URL for client-side upload
- `POST /api/documents/sync` — trigger Bedrock ingestion job
- `GET /api/documents/sync-status/:jobId` — poll ingestion job status
- `DELETE /api/documents/:key` — delete document from S3

**Dashboard UI** (`apps/web/src/app/dashboard/documents/page.tsx`):
- Drag & drop file upload via presigned URLs
- Document list with size, date, delete
- Auto-sync after upload with status indicator

## Current State

- Infrastructure: fully deployed, working
- Dashboard: functional (login, live widget demo, snippet generation, conversation history)
- Dashboard in main stack: optional, API key + Cognito auth, independently toggleable UI
- AgentCore: container-based deploy (ECR + CodeBuild), Claude Sonnet 4.6, system prompt via Bedrock Prompt Management
- Auth: AgentCore validates JWTs via configurable OIDC (`oidc_discovery_url` variable)
- Memory: conversation persistence across turns via AgentCore Memory
- Widget: hosted on dedicated CDN (main stack), SSE streaming with markdown rendering, pill input UI
- Knowledge Base: optional, S3 Vectors storage, document upload via dashboard, agent retrieval via `retrieve` tool
- MCP integration: built but needs end-to-end testing with a real MCP server

## Conventions

- Terraform resources use `local.name_prefix` (`var.project_name`) as prefix
- `count = var.enable_agentcore ? 1 : 0` pattern for optional resources in main stack
- `count = local.enable_dashboard` / `local.enable_dashboard_ui` for dashboard resources
- Lambda env vars: `AGENTCORE_RUNTIME_URL` (direct HTTP URL), `AGENTCORE_MEMORY_ID`, `DASHBOARD_API_KEY`, plus optional `KB_DOCS_BUCKET`, `KNOWLEDGE_BASE_ID`, `KB_DATA_SOURCE_ID`
- esbuild for all JS bundling (API + snippet), with `--external:@aws-sdk/*` (except `@aws-sdk/client-bedrock-agentcore` which must be bundled — not in Lambda runtime)
- All API routes under `/api/*`, proxied by CloudFront to Lambda Function URL
- AgentCore `authorizer_configuration` uses dynamic block — only added when `oidc_discovery_url` is set
- AgentCore `request_header_configuration` allowlists `Authorization` header so the container can extract JWT identity
- Dashboard API auth: `dashboardAuth` middleware tries `X-API-Key` first, then Cognito JWT
- Auth routes (`/callback`, `/logout`, `/me`) return 404 when Cognito not configured
- CORS origin is dynamic — reflects the request's `Origin` header (no hardcoded `DASHBOARD_URL`)
- Dashboard URL derived at runtime from `X-Forwarded-Host` header (set by CloudFront Function), not from env vars
- `count = local.enable_kb` for knowledge base resources
- S3 Vectors metadata: `AMAZON_BEDROCK_TEXT` and `AMAZON_BEDROCK_METADATA` must be in `non_filterable_metadata_keys` (2048 byte filterable limit)
- Cognito callback URLs use `terraform_data` provisioner (not `null_resource`) to break circular dependency with CloudFront
- `.gitignore` uses `**` glob patterns for terraform files (covers both `terraform/` and `demo/terraform/`)
