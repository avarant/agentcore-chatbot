# Getting Started

AgentCore Chatbot is a self-hosted AI chatbot platform on AWS. This guide walks through deploying the full stack from scratch.

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Python** 3.11+
- **Terraform** 1.5+
- **AWS CLI** v2, configured with credentials
- **AWS account** with Bedrock model access enabled for `anthropic.claude-sonnet-4-6`

## 1. Install dependencies

```bash
pnpm install
```

## 2. Deploy the main stack (AgentCore + Widget CDN)

The main stack provisions the AI agent runtime, conversation memory, and a CDN for the embeddable widget.

```bash
cd terraform
terraform init
terraform apply
```

This creates:
- **ECR repository** + **CodeBuild** project (builds the agent Docker image automatically)
- **AgentCore Runtime** (container-based agent on Bedrock)
- **AgentCore Memory** (conversation persistence with summarization)
- **S3 + CloudFront** CDN for `widget.js`

Save the outputs — you'll need them for the next steps:

```bash
terraform output
# Key outputs:
#   agentcore_runtime_url
#   agentcore_memory_id
#   widget_url
```

### Optional: remote state backend

For team use, set up an S3 backend for Terraform state:

```bash
cd terraform/bootstrap
terraform init && terraform apply
```

Then uncomment the `backend "s3"` block in `terraform/main.tf` and re-run `terraform init`.

### Optional: Knowledge Base

To enable document retrieval (upload docs via dashboard, agent answers from them):

```bash
# Add to terraform.tfvars:
enable_knowledge_base = true
```

Then re-run `terraform apply`. This provisions:
- **S3 bucket** for document uploads
- **S3 Vectors** bucket + index for embeddings
- **Bedrock Knowledge Base** with Titan Embed V2

After deploying, rebuild the agent (`./scripts/deploy-agent.sh`) so it picks up the `KNOWLEDGE_BASE_ID` env var and loads the `retrieve` tool. Upload documents via the dashboard's Documents page — they're automatically embedded and available to the agent.

## 3. Deploy the widget

Build the widget and upload it to the CDN:

```bash
cd packages/chatbot-snippet
npm run build

# From repo root:
cd terraform
eval $(terraform output -raw deploy_widget_command)
```

## 4. Deploy the demo stack

The demo stack adds a Cognito-authenticated dashboard for testing the widget.

```bash
cd demo/terraform
terraform init
terraform apply \
  -var='agentcore_runtime_url=<from step 2>' \
  -var='agentcore_memory_id=<from step 2>'
```

This creates:
- **Cognito** user pool + OAuth client
- **S3 + CloudFront** for the dashboard (Next.js static export)
- **Lambda Function URL** for the API (auth, token, conversations)

Save the outputs:

```bash
terraform output
# Key outputs:
#   demo_url
#   cognito_domain
#   cognito_client_id
#   oidc_discovery_url
```

## 5. Connect OIDC auth

Pass the demo's OIDC discovery URL back to the main stack so AgentCore validates JWTs:

```bash
cd terraform
terraform apply \
  -var='oidc_discovery_url=<oidc_discovery_url from step 4>' \
  -var='oidc_allowed_audience=<cognito_client_id from step 4>'
```

## 6. Build and deploy the API

```bash
cd apps/api
pnpm build

# From repo root:
cd demo/terraform
eval $(terraform output -raw deploy_lambda_command)
```

## 7. Build and deploy the frontend

```bash
cd apps/web

NEXT_PUBLIC_API_URL="" \
NEXT_PUBLIC_COGNITO_DOMAIN=<cognito_domain> \
NEXT_PUBLIC_COGNITO_CLIENT_ID=<cognito_client_id> \
NEXT_PUBLIC_AUTH_CALLBACK_URL=<demo_url>/api/auth/callback \
NEXT_PUBLIC_RUNTIME_URL=<agentcore_runtime_url> \
NEXT_PUBLIC_WIDGET_URL=<widget_url> \
npx next build

# From repo root:
cd demo/terraform
eval $(terraform output -raw deploy_frontend_command)
```

## 8. Verify

1. Open the `demo_url` in a browser
2. Create a Cognito user (or sign up through the hosted UI)
3. Log in — the dashboard should load with the chat widget in the bottom-right
4. Send a test message to verify the agent responds

## Embedding the widget on your own site

Once deployed, add this snippet to any page:

```html
<script>
(function() {
  var s = document.createElement('script');
  s.src = '<widget_url>';
  s.setAttribute('data-runtime-url', '<agentcore_runtime_url>');
  s.setAttribute('data-token-url', 'YOUR_TOKEN_ENDPOINT');
  s.async = true;
  document.head.appendChild(s);
})();
</script>
```

Replace `YOUR_TOKEN_ENDPOINT` with an endpoint on your site that returns a JWT. See [authentication.md](authentication.md) for details on setting up JWT auth.
