# Django Integration

If your site uses Django's built-in authentication (session-based) instead of an OIDC provider, you can integrate with Agent77 by exposing a minimal set of OIDC-compatible endpoints. Django doesn't need to become a full OIDC provider — just enough for AgentCore to verify tokens.

## Overview

AgentCore validates JWTs by fetching your site's `/.well-known/openid-configuration`, discovering the JWKS URI, and checking the token signature. You need three things:

1. A **JWKS endpoint** serving your public key
2. An **OpenID configuration** endpoint pointing to it
3. A **token endpoint** that checks Django's session and returns a signed JWT

## Prerequisites

```bash
pip install PyJWT cryptography
```

Generate an RSA key pair (once):

```bash
openssl genrsa -out agent77_private.pem 2048
openssl rsa -in agent77_private.pem -pubout -out agent77_public.pem
```

Store these in Django settings (or read from files/environment):

```python
# settings.py
AGENT77_PRIVATE_KEY = open("agent77_private.pem").read()
AGENT77_PUBLIC_KEY = open("agent77_public.pem").read()
AGENT77_ISSUER = "https://yoursite.com"  # must be publicly reachable
AGENT77_AUDIENCE = "agent77"
```

## Views

```python
# agent77/views.py
import json
import time

import jwt as pyjwt
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from django.conf import settings
from django.http import JsonResponse
from jwt.algorithms import RSAAlgorithm


def openid_configuration(request):
    """Minimal OpenID Connect discovery document."""
    return JsonResponse({
        "issuer": settings.AGENT77_ISSUER,
        "jwks_uri": f"{settings.AGENT77_ISSUER}/.well-known/jwks.json",
        "id_token_signing_alg_values_supported": ["RS256"],
    })


def jwks(request):
    """JSON Web Key Set — serves the public key for token verification."""
    public_key = load_pem_public_key(settings.AGENT77_PUBLIC_KEY.encode())
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    jwk["kid"] = "agent77-key-1"
    jwk["use"] = "sig"
    return JsonResponse({"keys": [jwk]})


def token(request):
    """Issue a JWT for the current authenticated Django user."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "unauthorized"}, status=401)

    now = int(time.time())
    payload = {
        "sub": str(request.user.pk),
        "email": request.user.email,
        "iss": settings.AGENT77_ISSUER,
        "aud": settings.AGENT77_AUDIENCE,
        "iat": now,
        "exp": now + 3600,
    }
    signed = pyjwt.encode(
        payload,
        settings.AGENT77_PRIVATE_KEY,
        algorithm="RS256",
        headers={"kid": "agent77-key-1"},
    )
    return JsonResponse({"token": signed})
```

## URLs

```python
# agent77/urls.py (or include in your root urls.py)
from django.urls import path
from . import views

urlpatterns = [
    path(".well-known/openid-configuration", views.openid_configuration),
    path(".well-known/jwks.json", views.jwks),
    path("api/agent77/token", views.token),
]
```

## Terraform Configuration

Point AgentCore at your Django site's discovery endpoint:

```hcl
oidc_discovery_url  = "https://yoursite.com/.well-known/openid-configuration"
oidc_allowed_audience = "agent77"
```

## Widget Embed

Add the widget to your Django template:

```html
<script
  src="{{ AGENT77_WIDGET_URL }}"
  data-runtime-url="{{ AGENT77_RUNTIME_URL }}"
  data-token-url="/api/agent77/token"
  async>
</script>
```

The `data-token-url` is a relative path — the widget will call it on the same origin. Django's session cookie is sent automatically, so the token endpoint can verify `request.user.is_authenticated` without any extra client-side auth logic.

## How It Works

```
User (logged into Django)
  → Widget loads on page
  → Widget fetches /api/agent77/token (Django session cookie sent)
  → Django verifies session, returns signed JWT
  → Widget sends JWT to AgentCore
  → AgentCore fetches /.well-known/openid-configuration from your site
  → AgentCore fetches /.well-known/jwks.json, verifies JWT signature
  → Request processed, response streamed back to widget
```

## Key Rotation

To rotate keys:

1. Generate a new key pair
2. Serve both old and new keys in the JWKS response (add a second entry to the `keys` array with a new `kid`)
3. Start signing new tokens with the new key
4. After all old tokens have expired (1 hour), remove the old key from JWKS

## Notes

- Your Django site must be publicly reachable — AgentCore fetches the JWKS endpoint at runtime to verify tokens.
- The `sub` claim is used as the user identity for conversation memory. Each unique `sub` gets their own conversation history.
- Token lifetime is set to 1 hour in the example. The widget re-fetches the token before each conversation, so shorter lifetimes are fine.
- If your Django app is behind a CDN or proxy, ensure `/.well-known/*` paths are forwarded to Django and not cached with stale keys.
