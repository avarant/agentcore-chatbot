# AgentCore Chatbot

> Add an AI chatbot to any website, connected to your MCP server. Self-hosted on AWS.

AgentCore Chatbot lets you deploy an AI chatbot widget on your website that connects to your [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server. End users chat with an AI agent that calls tools on your MCP server, scoped to their permissions via JWT authentication.

## Architecture

```
Main Stack (terraform/) — AgentCore + Widget CDN
├── ECR + CodeBuild     — Agent container image (ARM64)
├── AgentCore Runtime   — AI agent (Claude via Bedrock)
├── AgentCore Memory    — Conversation persistence
└── S3 + CloudFront     — widget.js CDN (CORS-enabled)

Demo Stack (demo/terraform/) — Dashboard for testing
├── Cognito             — User pool + OAuth client
├── CloudFront + S3     — Next.js dashboard
├── Lambda Function URL — API (auth, token, conversations)
└── /api/*              — Proxied through CloudFront
```

## Prerequisites

- **AWS account** with Bedrock model access for `anthropic.claude-sonnet-4-6`
- **AWS CLI** v2 configured (`aws configure`)
- **Terraform** >= 1.5
- **Node.js** >= 20
- **pnpm** (`npm install -g pnpm`)
- **Python** >= 3.11 (for the agent container)

## Quick Start

```bash
git clone https://github.com/avarant/agentcore-chatbot.git
cd agentcore-chatbot
pnpm install
```

See [docs/getting-started.md](docs/getting-started.md) for the full setup walkthrough.

## Project Structure

```
apps/
├── api/                  Lambda API (Hono)
│   └── src/routes/       auth, token, conversations
└── web/                  Next.js dashboard (static export)

packages/
└── chatbot-snippet/      Embeddable JS widget (IIFE, Shadow DOM)

agent/                    AgentCore agent (Python)
├── main.py               Strands Agent entrypoint
├── agent.py              Production agent (MCP client, Claude tool loop)
└── Dockerfile

terraform/                Main stack (AgentCore + widget CDN)
demo/terraform/           Demo stack (Cognito + dashboard + API)
docs/                     Setup and usage guides
```

## Documentation

- [Getting Started](docs/getting-started.md) — full deploy walkthrough
- [Authentication](docs/authentication.md) — OIDC/JWT setup for the widget
- [Local Development](docs/local-development.md) — running the dashboard locally

## How It Works

1. You embed a `<script>` tag on your site pointing to the widget CDN
2. The widget fetches a JWT from your token endpoint
3. The widget sends messages directly to AgentCore with the JWT
4. AgentCore validates the JWT against your OIDC provider
5. The agent processes the message via Claude, calling tools on your MCP server
6. The response streams back to the widget

## Insights

The dashboard includes a weekly **Insights** view that uses Claude to analyze your chatbot conversations and surface the **recurring questions**, **friction themes**, and **top topics** your end users hit. A scheduled (EventBridge) job regenerates the report each week and caches it in DynamoDB, so the analysis never runs on the request path. It ships with the dashboard stack — see the `insights_model_id` variable in `terraform/dashboard/`.

## License

MIT
