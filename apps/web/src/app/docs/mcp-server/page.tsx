export default function McpServerPage() {
  return (
    <article className="prose prose-gray max-w-3xl">
      <h1>MCP Server Requirements</h1>
      <p>
        Your MCP (Model Context Protocol) server is where the agent&apos;s tools
        live. Agent77 connects to it over SSE and forwards the user&apos;s JWT
        so your server can authorize every request.
      </p>

      <h2>What Your MCP Server Needs</h2>
      <ul>
        <li>
          <strong>SSE transport.</strong> Agent77 connects via Server-Sent
          Events. Your server must support the MCP SSE transport layer.
        </li>
        <li>
          <strong>JWT validation.</strong> Every request includes the
          user&apos;s JWT in the <code>Authorization: Bearer</code> header.
          Validate it before executing any tool.
        </li>
        <li>
          <strong>Tool definitions.</strong> Expose tools using the MCP{" "}
          <code>tools/list</code> method. Each tool needs a name, description,
          and JSON Schema for its parameters.
        </li>
      </ul>

      <h2>JWT Validation</h2>
      <p>
        When Agent77 calls your MCP server, it forwards the JWT that was issued
        by your token endpoint. Your server should:
      </p>
      <ol>
        <li>
          Extract the token from the <code>Authorization</code> header.
        </li>
        <li>
          Fetch your JWKS (or cache it) and verify the signature.
        </li>
        <li>
          Check <code>aud === &quot;chatbot&quot;</code> and{" "}
          <code>iss</code> matches your domain.
        </li>
        <li>
          Check <code>exp</code> has not passed.
        </li>
        <li>
          Use <code>sub</code> as the authenticated user ID for authorization.
        </li>
      </ol>

      <h3>Python Example</h3>
      <pre><code className="language-python">{`import jwt
import requests
from functools import lru_cache

ISSUER = "https://app.example.com"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

@lru_cache(maxsize=1)
def get_jwks():
    return requests.get(JWKS_URL).json()

def validate_token(auth_header: str) -> dict:
    """Validate JWT and return decoded claims."""
    token = auth_header.removeprefix("Bearer ").strip()
    jwks = get_jwks()

    # Decode header to find kid
    header = jwt.get_unverified_header(token)
    kid = header["kid"]

    # Find matching key
    key_data = next(k for k in jwks["keys"] if k["kid"] == kid)
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        audience="chatbot",
        issuer=ISSUER,
    )`}</code></pre>

      <h3>Node.js Example</h3>
      <pre><code className="language-javascript">{`const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const ISSUER = process.env.SITE_URL;

const client = jwksClient({
  jwksUri: \`\${ISSUER}/.well-known/jwks.json\`,
  cache: true,
  rateLimit: true,
});

async function validateToken(authHeader) {
  const token = authHeader.replace("Bearer ", "").trim();
  const decoded = jwt.decode(token, { complete: true });
  const key = await client.getSigningKey(decoded.header.kid);

  return jwt.verify(token, key.getPublicKey(), {
    algorithms: ["RS256"],
    audience: "chatbot",
    issuer: ISSUER,
  });
}`}</code></pre>

      <h2>Tool Definition Best Practices</h2>
      <ul>
        <li>
          <strong>Clear descriptions.</strong> The agent reads tool descriptions
          to decide when to use them. Write them as if explaining to a coworker.
        </li>
        <li>
          <strong>Specific parameter schemas.</strong> Use{" "}
          <code>enum</code> for known values, add <code>description</code> to
          each property, and mark required fields.
        </li>
        <li>
          <strong>Scoped permissions.</strong> Use the JWT <code>sub</code>{" "}
          claim to scope data access. A tool like <code>list_orders</code>{" "}
          should only return orders for the authenticated user.
        </li>
        <li>
          <strong>Return structured data.</strong> Return JSON objects rather
          than strings so the agent can reason about the result.
        </li>
        <li>
          <strong>Fail with context.</strong> When a tool call fails, return an
          error message that helps the agent recover:{" "}
          <code>{`{"error": "Order not found", "suggestion": "Try list_orders first"}`}</code>
        </li>
      </ul>

      <h3>Example Tool Definition</h3>
      <pre><code className="language-json">{`{
  "name": "get_order",
  "description": "Retrieve details of a specific order for the current user. Returns order status, items, and tracking info.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "order_id": {
        "type": "string",
        "description": "The order ID (e.g. ORD-12345)"
      }
    },
    "required": ["order_id"]
  }
}`}</code></pre>
    </article>
  );
}
