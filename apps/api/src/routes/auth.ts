import { Hono } from "hono";
import type { Env } from "../types";
import { validateJwt } from "../lib/auth";

export const authRoutes = new Hono<Env>();

authRoutes.get("/callback", async (c) => {
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!cognitoDomain || !clientId) {
    return c.json({ error: "UI auth not configured" }, 404);
  }

  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  const dashboardUrl = process.env.DASHBOARD_URL || "";
  const redirectUri = dashboardUrl ? `${dashboardUrl}/api/auth/callback` : "http://localhost:3000/auth/callback";

  // Exchange auth code for tokens with Cognito
  const tokenUrl = `${cognitoDomain}/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json({ error: "Token exchange failed", details: err }, 400);
  }

  const tokens = (await tokenRes.json()) as {
    id_token: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Validate the ID token
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  const region = userPoolId.split("_")[0];
  const payload = await validateJwt(tokens.id_token, {
    userPoolId,
    region,
    clientId,
  });

  if (!payload) {
    return c.json({ error: "Invalid ID token" }, 401);
  }

  // Set JWT cookie and redirect to dashboard
  const maxAge = tokens.expires_in || 3600;
  const redirectTo = dashboardUrl ? `${dashboardUrl}/dashboard` : "/dashboard";

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      "Set-Cookie": `token=${tokens.id_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    },
  });
});

authRoutes.get("/logout", async (c) => {
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!cognitoDomain || !clientId) {
    return c.json({ error: "UI auth not configured" }, 404);
  }

  const dashboardUrl = process.env.DASHBOARD_URL || "";
  const logoutRedirect = encodeURIComponent(dashboardUrl || "http://localhost:3000");

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${logoutRedirect}`,
      "Set-Cookie": `token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
});

// Token endpoint — GET and POST (chatbot-snippet uses POST)
function handleToken(c: any) {
  const cookie = c.req.header("Cookie");
  let token: string | undefined;
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) token = match[1];
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ token });
}

authRoutes.get("/token", handleToken);
authRoutes.post("/token", handleToken);

authRoutes.get("/me", async (c) => {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    return c.json({ error: "UI auth not configured" }, 404);
  }

  let token: string | undefined;

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    const cookie = c.req.header("Cookie");
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) token = match[1];
    }
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const region = userPoolId.split("_")[0];
  const payload = await validateJwt(token, {
    userPoolId,
    region,
    clientId,
  });

  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }

  return c.json({
    user: {
      sub: payload.sub,
      email: payload.email,
    },
  });
});
