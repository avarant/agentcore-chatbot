# Authentication

AgentCore Chatbot uses JWT-based authentication to secure the chat widget. AgentCore validates tokens against an OIDC provider before processing any request.

## How it works

1. User visits your site
2. Widget calls your **token endpoint** (`data-token-url` attribute)
3. Your endpoint returns a JWT signed by your OIDC provider
4. Widget sends the JWT to AgentCore via `Authorization: Bearer <token>`
5. AgentCore validates the JWT against the configured OIDC discovery URL
6. If valid, the request is processed; if not, it's rejected

## Configuring OIDC

Set two Terraform variables in the main stack (`terraform/`):

| Variable | Description |
|---|---|
| `oidc_discovery_url` | Your provider's `/.well-known/openid-configuration` URL |
| `oidc_allowed_audience` | The client ID (audience claim) to validate |

```bash
cd terraform
terraform apply \
  -var='oidc_discovery_url=https://your-provider.com/.well-known/openid-configuration' \
  -var='oidc_allowed_audience=your-client-id'
```

### Supported providers

Any OIDC-compliant provider works:
- **AWS Cognito** (used in the demo stack)
- **Auth0**
- **Okta**
- **Google Identity Platform**
- **Azure AD / Entra ID**

## Token endpoint requirements

Your token endpoint must:

1. Authenticate the current user (via session cookie, existing auth, etc.)
2. Return a JSON response with a JWT:
   ```json
   { "token": "eyJhbG..." }
   ```
3. The JWT must include standard claims (`sub`, `iss`, `aud`, `exp`)
4. The `iss` must match the OIDC discovery URL's issuer
5. The `aud` must match `oidc_allowed_audience`

## Dashboard auth flow

The dashboard (main stack or demo) uses Cognito with this flow:

```
User → /login → Cognito hosted UI → /api/auth/callback → httpOnly cookie → /dashboard
```

- `/api/auth/callback` exchanges the Cognito auth code for tokens and sets an httpOnly cookie
- `/api/auth/token` returns the user's access token (used by the widget)
- `/api/auth/me` returns the current user profile

The dashboard URL is derived at runtime from the `X-Forwarded-Host` header (set by a CloudFront Function), not from an environment variable. This avoids circular dependencies between Lambda, CloudFront, and Cognito in Terraform.

## Session management

AgentCore uses two identifiers for conversation tracking:

- **`session_id`**: Groups messages into a conversation thread
- **`user_id`**: Derived from the JWT `sub` claim, identifies the user across sessions

The `user_id` is sanitized to match AgentCore's actor ID format (`[a-zA-Z0-9][a-zA-Z0-9-_/]*`). Email addresses have `@` and `.` replaced with `_`.
