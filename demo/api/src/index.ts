import { Hono } from "hono";
import { handle } from "hono/aws-lambda";

const app = new Hono();

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || "";

const DEMO_URL = process.env.DEMO_URL || "";

function getDemoUrl(c: { req: { header: (name: string) => string | undefined } }): string {
  if (DEMO_URL) return DEMO_URL;
  const host = c.req.header("x-forwarded-host") || c.req.header("Host") || "";
  const proto = c.req.header("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// GET /api/auth/login — redirect to Cognito hosted UI
// ---------------------------------------------------------------------------
app.get("/api/auth/login", (c) => {
  const demoUrl = getDemoUrl(c);
  const callbackUrl = `${demoUrl}/api/auth/callback`;
  const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(callbackUrl)}`;
  return c.redirect(loginUrl);
});

// ---------------------------------------------------------------------------
// GET /api/auth/callback — exchange code for tokens, set cookie
// ---------------------------------------------------------------------------
app.get("/api/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.text("Missing authorization code", 400);
  }

  const demoUrl = getDemoUrl(c);
  const callbackUrl = `${demoUrl}/api/auth/callback`;
  const tokenUrl = `${COGNITO_DOMAIN}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    client_secret: COGNITO_CLIENT_SECRET,
    code,
    redirect_uri: callbackUrl,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    return c.text(`Token exchange failed: ${err}`, 500);
  }

  const tokens = (await res.json()) as {
    id_token: string;
    access_token: string;
    refresh_token?: string;
  };

  // Set httpOnly cookie with the ID token
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: demoUrl,
      "Set-Cookie": `token=${tokens.id_token}; ${cookieFlags}`,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — validate JWT, return user info
// ---------------------------------------------------------------------------
app.get("/api/auth/me", async (c) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Decode JWT payload (validation happens at AgentCore level)
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.email) {
    return c.json({ error: "Invalid token" }, 401);
  }

  return c.json({ email: payload.email, sub: payload.sub });
});

// ---------------------------------------------------------------------------
// POST /api/chatbot-token — extract JWT from cookie, return for widget
// ---------------------------------------------------------------------------
app.post("/api/chatbot-token", async (c) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ token });
});

// Also support GET for simpler widget integrations
app.get("/api/chatbot-token", async (c) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ token });
});

// ---------------------------------------------------------------------------
// GET /api/auth/logout — clear cookie and redirect to Cognito logout
// ---------------------------------------------------------------------------
app.get("/api/auth/logout", (c) => {
  const demoUrl = getDemoUrl(c);
  const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(demoUrl)}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: logoutUrl,
      "Set-Cookie": "token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    },
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/", (c) => c.json({ status: "ok", service: "agentcore-chatbot-demo-api" }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  // Check Authorization header first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Then check cookie
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, string> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    return payload;
  } catch {
    return null;
  }
}

export default app;
export const handler = handle(app);
