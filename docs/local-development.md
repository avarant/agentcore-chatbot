# Local Development

Run the dashboard and API locally for development.

## Prerequisites

- The main stack and demo stack must be deployed (see [getting-started.md](getting-started.md))
- Cognito callback URL must include `http://localhost:3000/api/auth/callback`

## Setup

Generate `.env.local` files from terraform outputs:

```bash
./scripts/setup-local-env.sh
```

This reads outputs from both terraform stacks and creates:
- `apps/api/.env.local` — Cognito config, AgentCore URLs, memory ID
- `apps/web/.env.local` — Cognito config, API URL pointing to local server

## Running

Start the API and frontend in separate terminals:

```bash
# Terminal 1: API (port 8787)
cd apps/api && pnpm dev

# Terminal 2: Frontend (port 3000)
cd apps/web && pnpm dev
```

The frontend proxies `/api/*` requests to the local API server.

## What works locally

- Dashboard UI with hot reload
- Cognito login/logout (redirects to hosted UI and back to localhost)
- Widget demo (loads from CDN, talks directly to AgentCore)
- Conversation history (API reads from AgentCore Memory)

## What requires AWS

- The chat widget always connects directly to AgentCore (no local agent)
- Conversation memory is always remote (AgentCore Memory service)
- Auth tokens are validated by AgentCore against the OIDC provider
