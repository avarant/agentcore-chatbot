# Agent77

> Add an AI chatbot to any website, connected to your MCP server. Self-hosted on AWS.

Agent77 lets you deploy an AI chatbot widget on your website that connects to your [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server. End users chat with an AI agent that calls tools on your MCP server, scoped to their permissions via JWT authentication.

## Architecture

```
AWS Account (single Terraform deployment)
├── CloudFront          — CDN: static frontend + /api/* proxy to Lambda
├── S3                  — Static assets (Next.js export)
├── API Gateway + Lambda — REST API (Hono on Node.js 20)
├── DynamoDB            — Configuration storage (single table)
├── Cognito             — Dashboard authentication (email/password)
└── AgentCore Runtime   — AI agent execution (Claude via Bedrock)
```

## Prerequisites

- **AWS account** with permissions for CloudFront, S3, Lambda, DynamoDB, Cognito, Bedrock, and AgentCore
- **AWS CLI** configured (`aws configure`)
- **Terraform** >= 1.5
- **Node.js** >= 20
- **Python** >= 3.10 (for building the agent package)
- **pnpm** (install: `npm install -g pnpm`)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/avarant/agent77.git
cd agent77
pnpm install
```

### 2. Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
aws_region     = "us-east-1"
project_name   = "agent77"
admin_email    = "you@example.com"
admin_password = "YourPassword123!"

# Optional: custom domain
# domain = "chat.yourdomain.com"
```

### 3. (Optional) Set up remote backend

For team use or production, set up S3 state backend with DynamoDB locking:

```bash
cd terraform/bootstrap
terraform init
terraform apply
```

Then update `terraform/main.tf` — uncomment the `backend "s3"` block and fill in the values from the bootstrap output. Run `terraform init -migrate-state` to migrate.

### 4. Deploy infrastructure

```bash
cd terraform
terraform init
terraform apply
```

This provisions all AWS resources and creates an admin user in Cognito.

### 5. Build and deploy the application

```bash
# Build the API
cd apps/api && pnpm run build && cd ../..

# Create Lambda ZIP
cd apps/api/dist && zip -j lambda.zip index.js && cd ../../..

# Deploy Lambda
aws lambda update-function-code \
  --function-name $(cd terraform && terraform output -raw lambda_function_name) \
  --zip-file fileb://apps/api/dist/lambda.zip \
  --region $(cd terraform && terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

# Build the frontend (requires Terraform outputs for env vars)
cd apps/web
NEXT_PUBLIC_COGNITO_DOMAIN=$(cd ../../terraform && terraform output -raw cognito_domain) \
NEXT_PUBLIC_COGNITO_CLIENT_ID=$(cd ../../terraform && terraform output -raw cognito_client_id) \
NEXT_PUBLIC_AUTH_CALLBACK_URL=$(cd ../../terraform && terraform output -raw dashboard_url)/api/auth/callback \
NEXT_PUBLIC_API_URL=$(cd ../../terraform && terraform output -raw dashboard_url) \
npx next build
cd ../..

# Upload frontend to S3 and invalidate CloudFront
cd terraform
eval $(terraform output -raw deploy_frontend_command)
```

### 6. Log in

Open the dashboard URL from Terraform output:

```bash
cd terraform && terraform output dashboard_url
```

Log in with the `admin_email` and `admin_password` from your `terraform.tfvars`.

## Configuration

### Terraform Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `project_name` | Resource name prefix | `agent77` |
| `domain` | Custom domain (optional) | `""` |
| `admin_email` | Cognito admin email | required |
| `admin_password` | Cognito admin password | required |
| `enable_agentcore` | Provision AgentCore runtime | `true` |
| `agentcore_model_id` | Bedrock model ID | `anthropic.claude-3-sonnet-20240229-v1:0` |
| `lambda_memory_size` | Lambda memory (MB) | `512` |
| `lambda_timeout` | Lambda timeout (seconds) | `30` |

### Custom Domain

To use a custom domain (e.g., `chat.yourdomain.com`):

1. Set `domain = "chat.yourdomain.com"` in `terraform.tfvars`
2. Run `terraform apply`
3. Terraform outputs DNS validation records — add the CNAME record to your DNS provider
4. Add a CNAME pointing your domain to the CloudFront distribution domain name
5. Wait for ACM certificate validation (can take a few minutes)

## How It Works

1. **Deploy** — `terraform apply` provisions all AWS resources
2. **Login** — Access the dashboard with pre-configured admin credentials
3. **Configure** — Set your MCP server URL and OIDC provider (optional)
4. **Embed** — Copy the script tag and add it to your website
5. **Chat** — Your users get an AI assistant that calls tools on your MCP server

### Auth Flow

- **Dashboard**: Cognito User Pool (email/password)
- **End-user chat**: Your OIDC provider issues JWTs that the agent validates. The agent forwards the JWT to your MCP server for user-scoped tool calls.

## Project Structure

```
agent77/
├── apps/
│   ├── api/              # Lambda API (Hono + DynamoDB)
│   │   └── src/
│   │       ├── index.ts          # Router + Lambda handler
│   │       ├── routes/
│   │       │   ├── auth.ts       # Cognito OAuth callback + /me
│   │       │   ├── chat.ts       # AgentCore chat proxy
│   │       │   └── customers.ts  # Config CRUD + snippet
│   │       ├── db/queries.ts     # DynamoDB operations
│   │       └── lib/auth.ts       # JWT validation middleware
│   │
│   └── web/              # Next.js frontend (static export)
│       └── src/app/
│           ├── page.tsx          # Landing page
│           ├── login/            # Cognito login redirect
│           ├── dashboard/        # Dashboard (config, chat, snippet)
│           └── docs/             # Documentation pages
│
├── agent/                # AgentCore agent (Python)
│   ├── main.py           # Agent entry point
│   └── requirements.txt
│
└── terraform/            # Infrastructure as code
    ├── bootstrap/        # S3 backend + DynamoDB lock (run first)
    ├── main.tf           # Providers, backend, locals
    ├── variables.tf      # Input variables
    ├── terraform.tfvars.example
    ├── cognito.tf        # User pool + admin user
    ├── lambda.tf         # API Lambda + API Gateway
    ├── dynamodb.tf       # Config table
    ├── s3_cloudfront.tf  # S3 + CloudFront distribution
    ├── agentcore.tf      # AgentCore runtime + endpoint
    ├── acm.tf            # SSL certificate (custom domain)
    └── outputs.tf        # Dashboard URL, API URL, etc.
```

## Development

### Local API

```bash
cd apps/api
pnpm run dev
```

### Local Frontend

```bash
cd apps/web
pnpm run dev
```

## License

MIT
