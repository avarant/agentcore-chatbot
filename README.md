# Agent77

> Add an AI chatbot to any website, connected to your MCP server. Self-hosted, open-source.

Agent77 lets you deploy an AI chatbot widget on your website that connects to your [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server. End users chat with an AI agent that calls tools on your MCP server, scoped to their permissions via JWT authentication.

## Architecture

```
AWS Account (your infrastructure)
├── CloudFront          — Frontend (static site) + API (Lambda)
├── S3                  — Static assets (Next.js export, widget JS)
├── API Gateway + Lambda — REST API (Hono on Node.js 20)
├── DynamoDB            — Configuration storage (single table)
├── Cognito             — Dashboard authentication
├── AgentCore Runtime   — AI agent execution (Claude via Bedrock)
└── ECR                 — Agent container image
```

## Prerequisites

- AWS account with appropriate permissions
- [Terraform](https://terraform.io) >= 1.5
- [Node.js](https://nodejs.org) >= 20
- [Docker](https://docker.com) (for building the agent image)
- [pnpm](https://pnpm.io) (package manager)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-org/agent77.git
cd agent77
```

### 2. Install dependencies and build

```bash
pnpm install
cd apps/api && pnpm run build && cd ../..
cd apps/web && npx next build && cd ../..
```

### 3. Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 4. Deploy

```bash
terraform init
terraform apply
```

Terraform will output your dashboard URL, API endpoint, and Cognito login URL.

### 5. Upload frontend assets

```bash
# After terraform apply, upload the built frontend to S3
aws s3 sync ../apps/web/out s3://$(terraform output -raw frontend_bucket_name) --delete
```

### 6. Build and push agent image

```bash
cd ../agent
docker build -t agent77-agent .
aws ecr get-login-password --region $(cd ../terraform && terraform output -raw aws_region) | docker login --username AWS --password-stdin $(cd ../terraform && terraform output -raw ecr_repository_url)
docker tag agent77-agent:latest $(cd ../terraform && terraform output -raw ecr_repository_url):latest
docker push $(cd ../terraform && terraform output -raw ecr_repository_url):latest
```

## Configuration

### Terraform Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region for all resources | `us-east-1` |
| `project_name` | Prefix for resource names | `agent77` |
| `domain` | Custom domain (optional) | `""` |
| `agent_image_uri` | ECR image URI for the agent container | `""` |

### Environment Variables (Frontend)

Set these in your frontend build or `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API Gateway URL (from Terraform output) |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Cognito hosted UI domain |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito app client ID |
| `NEXT_PUBLIC_AUTH_CALLBACK_URL` | OAuth callback URL |

## Development

### Local API development

```bash
cd apps/api
pnpm run dev
```

### Local frontend development

```bash
cd apps/web
pnpm run dev
```

### Project structure

```
agent77/
├── apps/
│   ├── api/              # Lambda API (Hono + DynamoDB)
│   │   ├── src/
│   │   │   ├── index.ts          # Router + Lambda handler
│   │   │   ├── types.ts          # Environment types
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts       # Cognito OAuth callback + /me
│   │   │   │   └── customers.ts  # Config CRUD + snippet
│   │   │   ├── db/
│   │   │   │   └── queries.ts    # DynamoDB operations
│   │   │   └── lib/
│   │   │       ├── auth.ts       # JWT validation middleware
│   │   │       └── agentcore.ts  # AgentCore API (SigV4)
│   │   └── package.json
│   │
│   └── web/              # Next.js frontend
│       ├── src/app/
│       │   ├── page.tsx          # Landing page
│       │   ├── login/            # Cognito login redirect
│       │   ├── dashboard/        # Single-page dashboard
│       │   ├── docs/             # Documentation pages
│       │   └── components/       # Header, Footer
│       └── package.json
│
├── packages/
│   └── chatbot-snippet/  # Embeddable chat widget
│
├── agent/                # AgentCore agent (Python + Docker)
│   ├── agent.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── terraform/            # Infrastructure as code
│   ├── main.tf
│   ├── variables.tf
│   ├── cognito.tf
│   ├── lambda.tf
│   ├── dynamodb.tf
│   ├── s3_cloudfront.tf
│   ├── ecr.tf
│   └── agentcore.tf
│
└── PRD.md
```

## How It Works

1. **Deploy** — `terraform apply` provisions all AWS resources in your account
2. **Configure** — Log in to the dashboard, set your MCP server URL and OIDC provider
3. **Embed** — Copy the script tag and add it to your website
4. **Chat** — Your users get an AI assistant that calls tools on your MCP server

### Auth Flow

- **Dashboard**: Cognito User Pool (email/password + Google)
- **End-user chat**: Your own OIDC provider issues JWTs that AgentCore validates. The agent forwards the JWT to your MCP server for user-scoped tool calls.

## License

MIT
