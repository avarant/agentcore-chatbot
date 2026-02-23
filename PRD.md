# Agent77 — Product Requirements Document

> Add an AI chatbot to any website, connected to your MCP server. Self-hosted, open-source.

---

## 1. Product Overview

**Agent77** is an open-source, self-hosted platform that lets any website owner add an AI chatbot connected to their MCP server. Users deploy the entire stack in their own AWS account using Terraform, then embed a single JS snippet on their site. Logged-in users chat with an agent that calls tools on the owner's MCP server on their behalf.

- **Target user:** Developers and companies with existing web apps and MCP servers
- **Key value prop:** One JS snippet, authenticated end-user sessions, user-scoped tool calls
- **Deployment:** Self-hosted on AWS via Terraform (Lambda, DynamoDB, CloudFront, AgentCore)

---

## 2. Architecture

```
AWS Account (single deployment)
├── CloudFront        — Frontend (S3) + API (/api/* → Lambda)
├── S3                — Static assets (Next.js export, widget JS)
├── API Gateway       — HTTP API → Lambda proxy
├── Lambda            — API (Hono, Node.js 20)
├── DynamoDB          — Configuration table (single-table design)
├── Cognito           — Dashboard login (Google, email)
├── AgentCore Runtime — AI agent execution (Claude via Bedrock)
└── ECR               — Agent container image
```

CloudFront serves both the frontend and API on a single domain, so cookies work without cross-origin issues. All resources are provisioned by Terraform.

---

## 3. User Flows

### Deployment

1. Clone the repo, configure `terraform.tfvars`
2. Run `terraform apply` — provisions all AWS resources
3. Upload frontend build to S3, push agent image to ECR
4. Log in via Cognito at the dashboard URL
5. Configure MCP server URL, OIDC discovery URL, and allowed audiences
6. Copy the JS snippet and embed it on the target website
7. Add a token endpoint to the website (template provided in /docs)

### End-User Chat Flow

1. End user visits the site (already logged in to the site's app)
2. JS snippet loads and renders a chat button (shadow DOM, white-label)
3. User clicks chat and types a message
4. Snippet calls the site's `/api/chatbot-token/` endpoint (session cookie → JWT)
5. Snippet sends the message + JWT directly to the AgentCore Runtime
6. AgentCore validates the JWT; the agent executes
7. Agent forwards the JWT to the MCP server and calls tools
8. Streamed response is returned to the user

---

## 4. Frontend — Next.js

### Marketing Site (SSG)

| Route | Description |
|-------|-------------|
| `/` | Landing page (hero, features, quick start, CTA) |
| `/docs` | Embedded MDX documentation |

### Docs (`/docs`, MDX)

- Getting started guide
- Token endpoint setup (Django, Express, Rails templates)
- OIDC discovery setup guide (2 endpoints)
- MCP server requirements
- JS snippet customization
- API reference

### Dashboard (auth-gated, single page)

| Route | Description |
|-------|-------------|
| `/dashboard` | Status, configuration form, snippet, danger zone |

### Auth Flow

- Cognito hosted UI for login (Google + email/password)
- JWT stored in httpOnly cookie
- Lambda API validates Cognito JWT on every request

---

## 5. Backend — Lambda API (Hono)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/callback` | Cognito OAuth callback |
| GET | `/api/auth/me` | Get current user from JWT |
| GET | `/api/customers/me` | Get configuration |
| PUT | `/api/customers/me` | Update MCP URL, OIDC URL, settings |
| DELETE | `/api/customers/me` | Delete configuration |
| GET | `/api/customers/snippet` | Get generated JS snippet |

### DynamoDB Schema (Single Table)

| PK | SK | Attributes |
|----|-----|------------|
| `CUSTOMER` | `PROFILE` | id, user_id, email, domain, status, created_at |
| `CUSTOMER` | `MCP_CONFIG` | id, mcp_url, oidc_discovery_url, allowed_audiences, created_at |

---

## 6. AgentCore Provisioning

Provisioned by Terraform using AWS CLI `local-exec`.

### Configuration

- AgentCore Runtime created with the OIDC config from Terraform variables
- Shared agent code image deployed from ECR
- Runtime URL passed to Lambda as an environment variable

### Shared Agent Code

A single agent codebase deployed as a container:

- Reads `MCP_URL` from runtime config
- Decodes JWT claims to identify the end user
- Connects to the MCP server via an MCP client, forwarding the JWT
- Uses Claude via Amazon Bedrock as the LLM
- Streams the response back to the caller

---

## 7. JS Snippet (`chatbot-snippet.js`)

The snippet is self-contained and designed for zero-friction embedding.

- **Isolation:** Shadow DOM for full style isolation
- **Branding:** White-label (no Agent77 branding visible)
- **Auth:** Auto-fetches JWT from the site's token endpoint; auto-refreshes before expiry; handles 401 retry
- **Streaming:** Streams responses from AgentCore in real time
- **Delivery:** Served from the same S3/CloudFront as the frontend

### Embed Example

```html
<script
  src="https://your-cloudfront-domain/widget.js"
  data-token-url="/api/chatbot-token/"
  data-runtime-url="https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/RUNTIME_ID/invocations?qualifier=DEFAULT"
></script>
```

Configuration is passed via `data-` attributes — no JavaScript initialization code required.

---

## 8. Auth Architecture

### Dashboard Auth (Cognito)

- Cognito User Pool with Google + email/password providers
- Hosted UI for sign-in/sign-up
- JWT validated by the Lambda API on every request

### End-User Chat Auth (Site Owner's IdP)

- Site owner provides their OIDC discovery URL and JWKS endpoint
- Site owner implements a token endpoint in their app (session cookie → signed JWT)
- AgentCore validates the JWT on every request using the owner's JWKS
- The agent forwards the JWT to the MCP server, enabling user-scoped tool calls

This two-layer auth model keeps Agent77's auth (Cognito) completely separate from end-user auth (site owner-managed).

---

## 9. Infrastructure (Terraform)

All resources are provisioned in the deployer's AWS account via Terraform.

| Resource | Purpose |
|----------|---------|
| CloudFront | CDN + unified domain for frontend and API |
| S3 | Static frontend assets + widget JS |
| API Gateway (HTTP) | Routes /api/* to Lambda |
| Lambda (Node.js 20) | API server (Hono framework) |
| DynamoDB | Configuration storage |
| Cognito | Dashboard authentication |
| AgentCore Runtime | AI agent execution |
| ECR | Agent container image registry |

### Cost at idle: ~$0

- Cognito: Free under 50k MAU
- AgentCore: Consumption-based, $0 when idle
- Lambda: Free tier covers 1M requests/month
- DynamoDB: Free tier covers 25GB + 25 RCU/WCU
- S3 + CloudFront: Minimal for low traffic

---

## 10. Scope

### In Scope

- Landing page with deployment instructions
- Cognito sign-up/login (Google + email)
- Single-page dashboard: status, configuration, snippet, delete
- Terraform for all AWS resources
- JS snippet (shadow DOM, white-label, streaming)
- Embedded docs with setup guides
- Claude via Bedrock as LLM
- JWT auth flow (site owner provides OIDC endpoints)
- Direct AgentCore connection (no proxy)

### Future

- Multiple LLM options
- Custom agent instructions
- Conversation history / memory
- Analytics dashboard
- Widget theming / customization UI

---

## 11. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (SSG + SPA), deployed to S3 + CloudFront |
| Docs | MDX pages within Next.js at `/docs` |
| API | AWS Lambda (Hono on Node.js 20) |
| Database | DynamoDB (single-table design) |
| Auth (dashboard) | Amazon Cognito |
| Auth (end-user chat) | Site owner's IdP (OIDC + JWT) |
| Agent hosting | AWS AgentCore Runtime |
| LLM | Claude via Amazon Bedrock |
| Infrastructure | Terraform |
| CDN | CloudFront |

---

## 12. File Structure

```
agent77/
├── apps/
│   ├── web/                    # Next.js app (marketing + dashboard)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx              # landing page
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── docs/                 # MDX docs
│   │   │   │   ├── components/
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   └── Footer.tsx
│   │   │   │   └── dashboard/
│   │   │   │       ├── layout.tsx
│   │   │   │       ├── page.tsx          # single-page dashboard
│   │   │   │       └── customer-context.tsx
│   │   │   └── lib/
│   │   ├── next.config.mjs
│   │   └── package.json
│   │
│   └── api/                    # Lambda API
│       ├── src/
│       │   ├── index.ts        # router + Lambda handler
│       │   ├── types.ts        # env types
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   └── customers.ts
│       │   ├── db/
│       │   │   └── queries.ts  # DynamoDB operations
│       │   └── lib/
│       │       ├── agentcore.ts
│       │       └── auth.ts
│       └── package.json
│
├── packages/
│   └── chatbot-snippet/        # JS snippet (standalone)
│       ├── src/
│       │   └── chatbot.ts
│       ├── dist/
│       │   └── chatbot.js
│       └── package.json
│
├── agent/                      # AgentCore agent code
│   ├── agent.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── terraform/                  # Infrastructure as code
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── cognito.tf
│   ├── lambda.tf
│   ├── dynamodb.tf
│   ├── s3_cloudfront.tf
│   ├── ecr.tf
│   ├── agentcore.tf
│   └── terraform.tfvars.example
│
├── README.md
└── PRD.md
```
