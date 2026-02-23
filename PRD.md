# Agent77 — Product Requirements Document

> Add an AI chatbot to any website, connected to your MCP server.

---

## 1. Product Overview

**Agent77** (agent77.app) is a SaaS platform that lets any website owner add an AI chatbot connected to their MCP server. Customers embed a single JS snippet; their logged-in users chat with an agent that calls tools on the customer's MCP server on their behalf.

- **Target customer:** Developers and companies with existing web apps and MCP servers
- **Key value prop:** One JS snippet, authenticated end-user sessions, user-scoped tool calls
- **MVP approach:** Cloudflare for frontend/API/data; AWS for AgentCore runtime and Cognito auth

---

## 2. Architecture

```
Cloudflare (frontend, API, data)
├── Pages (Next.js) — marketing, docs (/docs), dashboard
├── Workers — API (api.agent77.app)
├── D1 — customers, mcp_configs, usage_logs
├── KV — session cache, JWKS cache
└── R2 — generated snippets, assets

AWS (agent execution + auth)
├── Cognito — dashboard login (Google, email)
├── AgentCore Runtime — one per paying customer
└── Secrets Manager — customer MCP API keys (if needed)
```

The architecture splits cleanly: Cloudflare handles everything user-facing and data-related (free tier), while AWS handles agent execution (consumption-based, $0 when idle) and dashboard authentication (free under 50k MAU).

---

## 3. User Flows

### Customer Onboarding

1. Visit agent77.app — marketing page
2. Sign up via Cognito (Google or email/password)
3. Dashboard: enter website domain, MCP server URL, OIDC discovery URL
4. (Stripe payment skipped in dev, required in prod)
5. System provisions an AgentCore Runtime with the customer's OIDC config
6. Customer receives a JS snippet to embed
7. Customer adds a token endpoint to their app (template provided in /docs)

### End-User Chat Flow

1. End user visits the customer's site (already logged in to the customer's app)
2. JS snippet loads and renders a chat button (shadow DOM, white-label)
3. User clicks chat and types a message
4. Snippet calls the customer's `/api/chatbot-token/` endpoint (session cookie → JWT)
5. Snippet sends the message + JWT directly to the AgentCore Runtime
6. AgentCore validates the JWT; the agent executes
7. Agent forwards the JWT to the customer's MCP server and calls tools
8. Streamed response is returned to the user

---

## 4. Frontend — Next.js on Cloudflare Pages

### Marketing Site (SSG)

| Route | Description |
|-------|-------------|
| `/` | Landing page (hero, features, pricing, CTA) |
| `/pricing` | Plan details |
| `/docs` | Embedded MDX documentation |

### Docs (`/docs`, MDX)

- Getting started guide
- Token endpoint setup (Django, Express, Rails templates)
- OIDC discovery setup guide (2 endpoints)
- MCP server requirements
- JS snippet customization
- API reference

### Dashboard (auth-gated)

| Route | Description |
|-------|-------------|
| `/dashboard` | Overview (status, usage stats) |
| `/dashboard/setup` | Wizard: domain, MCP URL, OIDC URL |
| `/dashboard/snippet` | Generated snippet + copy button |
| `/dashboard/settings` | Update config, manage subscription |
| `/dashboard/usage` | Message count, basic analytics |

### Auth Flow

- Cognito hosted UI for login (Google + email/password)
- JWT stored in httpOnly cookie or localStorage
- Workers API validates Cognito JWT on every request

---

## 5. Backend — Cloudflare Workers API

### Endpoints (`api.agent77.app`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/callback` | Cognito OAuth callback |
| GET | `/api/auth/me` | Get current user from JWT |
| POST | `/api/customers` | Create customer record |
| GET | `/api/customers/:id` | Get customer config |
| PUT | `/api/customers/:id` | Update MCP URL, OIDC URL, settings |
| DELETE | `/api/customers/:id` | Teardown customer + Runtime |
| POST | `/api/customers/:id/provision` | Trigger AgentCore Runtime creation |
| GET | `/api/customers/:id/snippet` | Get generated JS snippet |
| POST | `/api/stripe/webhook` | Handle Stripe payment events (prod) |
| GET | `/api/usage/:id` | Get usage stats |

### D1 Schema

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,          -- Cognito sub
  email TEXT NOT NULL,
  domain TEXT,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'pending',  -- pending, active, suspended
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE mcp_configs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  mcp_url TEXT NOT NULL,
  oidc_discovery_url TEXT NOT NULL,
  allowed_audiences TEXT,         -- JSON array
  runtime_arn TEXT,               -- set after provisioning
  auth_method TEXT DEFAULT 'jwt', -- jwt or api_key
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  month TEXT NOT NULL,            -- "2026-02"
  message_count INTEGER DEFAULT 0,
  UNIQUE(customer_id, month)
);
```

---

## 6. AgentCore Provisioning

Triggered from the Cloudflare Worker using the AWS SDK with stored credentials.

### Provisioning Steps

1. Call `CreateAgentRuntime` with the customer's OIDC config:
   ```json
   {
     "customJWTAuthorizer": {
       "discoveryUrl": "<customer's OIDC URL>",
       "allowedAudience": ["chatbot"],
       "allowedScopes": ["chatbot:read"]
     }
   }
   ```
2. Deploy the shared agent code image (parameterized by env vars per customer)
3. Store the returned `runtime_arn` in D1
4. Generate the JS snippet with the runtime endpoint baked in

### Shared Agent Code

A single agent codebase is deployed once and shared across all customers. Per-customer behavior is driven by runtime config:

- Reads `MCP_URL` from runtime config
- Decodes JWT claims to identify the end user
- Connects to the customer's MCP server via an MCP client, forwarding the JWT
- Uses Claude via Amazon Bedrock as the LLM
- Streams the response back to the caller

---

## 7. JS Snippet (`chatbot-snippet.js`)

The snippet is self-contained and designed for zero-friction embedding.

- **Isolation:** Shadow DOM for full style isolation
- **Branding:** White-label (no Agent77 branding visible)
- **Auth:** Auto-fetches JWT from the customer's token endpoint; auto-refreshes before expiry; handles 401 retry
- **Streaming:** Streams responses from AgentCore in real time
- **Delivery:** Served from R2 or Cloudflare CDN

### Embed Example

```html
<script
  src="https://cdn.agent77.app/chatbot.js"
  data-token-url="/api/chatbot-token/"
  data-runtime-url="https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/ARN/invocations?qualifier=DEFAULT"
></script>
```

Configuration is passed via `data-` attributes — no JavaScript initialization code required.

---

## 8. Auth Architecture

### Dashboard Auth (Cognito)

- Cognito User Pool with Google + email/password providers
- Hosted UI for sign-in/sign-up
- JWT validated by the Workers API on every request

### End-User Chat Auth (Customer's IdP)

- Customer provides their OIDC discovery URL and JWKS endpoint
- Customer implements a token endpoint in their app (session cookie → signed JWT)
- AgentCore validates the JWT on every request using the customer's JWKS
- The agent forwards the JWT to the customer's MCP server, enabling user-scoped tool calls

This two-layer auth model keeps Agent77's auth (Cognito) completely separate from end-user auth (customer-managed).

---

## 9. Billing (Stripe)

- **Dev/MVP:** Payment is skipped; all customers get full access
- **Prod:** Stripe Checkout for subscription-based billing
- Stripe webhook → Worker updates customer `status` and `plan` in D1
- **Plan tiers (to be defined):** Free (limited), Pro, Enterprise

---

## 10. Infrastructure & Cost

### Cloudflare (free tier)

| Resource | Free Limit |
|----------|-----------|
| Workers | 100k requests/day |
| D1 | 5M rows read/day, 100k writes/day |
| KV | 100k reads/day |
| R2 | 10GB storage, 10M reads/mo |
| Pages | Unlimited sites, 500 builds/mo |

### AWS (free / consumption-based)

| Resource | Cost |
|----------|------|
| Cognito | Free under 50k MAU |
| AgentCore | Consumption-based, $0 when idle |
| Secrets Manager | $0.40/secret/month (only if using API keys) |

**Total cost at idle: $0**

---

## 11. MVP Scope

### In Scope

- Marketing site with pricing page
- Cognito sign-up/login (Google + email)
- Dashboard: setup wizard, snippet generation, basic usage stats
- AgentCore provisioning (one Runtime per customer)
- JS snippet (shadow DOM, white-label, streaming)
- Embedded docs with setup guides
- Claude via Bedrock as LLM
- JWT auth flow (customer provides OIDC endpoints)
- Direct AgentCore connection (no proxy)

### Out of Scope (Post-MVP)

- Stripe billing (skipped in dev)
- Usage-based metering / plan limits
- Proxy layer for analytics
- Multiple LLM options
- Custom agent instructions per customer
- Conversation history / memory
- Analytics dashboard
- Team accounts / multi-user
- Widget theming / customization UI

---

## 12. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (SSG + SPA), deployed to Cloudflare Pages |
| Docs | MDX pages within Next.js at `/docs` |
| API | Cloudflare Workers (Hono or itty-router) |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Storage | Cloudflare R2 |
| Auth (dashboard) | Amazon Cognito |
| Auth (end-user chat) | Customer's IdP (OIDC + JWT) |
| Agent hosting | AWS AgentCore Runtime |
| LLM | Claude via Amazon Bedrock |
| Payments | Stripe (prod only) |
| DNS/CDN | Cloudflare |

---

## 13. File Structure

```
agent77/
├── apps/
│   ├── web/                    # Next.js app (marketing + dashboard)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx              # landing page
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   ├── docs/                 # MDX docs
│   │   │   │   └── dashboard/
│   │   │   │       ├── page.tsx          # overview
│   │   │   │       ├── setup/page.tsx    # wizard
│   │   │   │       ├── snippet/page.tsx
│   │   │   │       ├── settings/page.tsx
│   │   │   │       └── usage/page.tsx
│   │   │   ├── components/
│   │   │   └── lib/
│   │   ├── next.config.mjs
│   │   └── package.json
│   │
│   └── api/                    # Cloudflare Workers API
│       ├── src/
│       │   ├── index.ts        # router
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── customers.ts
│       │   │   ├── provision.ts
│       │   │   ├── snippet.ts
│       │   │   └── stripe.ts
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── queries.ts
│       │   └── lib/
│       │       ├── agentcore.ts   # AWS SDK calls
│       │       └── auth.ts        # Cognito JWT validation
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   └── chatbot-snippet/        # JS snippet (standalone)
│       ├── src/
│       │   └── chatbot.ts
│       ├── dist/
│       │   └── chatbot.js      # built, served from CDN
│       └── package.json
│
├── agent/                      # AgentCore agent code
│   ├── agent.py                # main agent logic
│   ├── requirements.txt
│   └── Dockerfile
│
├── PRD.md
└── package.json                # workspace root
```
