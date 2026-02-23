import { Hono } from "hono";
import type { Env } from "../types";
import { validateJwt } from "../lib/auth";
import { getCustomer, createCustomer } from "../db/queries";

export const authRoutes = new Hono<Env>();

authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  const cognitoDomain = process.env.COGNITO_DOMAIN!;
  const clientId = process.env.COGNITO_CLIENT_ID!;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
  const redirectUri = process.env.COGNITO_REDIRECT_URI!;

  // Exchange auth code for tokens with Cognito
  const tokenUrl = `https://${cognitoDomain}/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
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
  const payload = await validateJwt(tokens.id_token, {
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    region: process.env.COGNITO_REGION!,
    clientId,
  });

  if (!payload) {
    return c.json({ error: "Invalid ID token" }, 401);
  }

  // Create customer record if it doesn't exist
  const existing = await getCustomer();
  if (!existing) {
    await createCustomer({
      id: crypto.randomUUID(),
      user_id: payload.sub,
      email: payload.email,
    });
  }

  // Set JWT cookie and redirect to dashboard
  const maxAge = tokens.expires_in || 3600;
  const dashboardUrl = process.env.DASHBOARD_URL || "/dashboard";

  return new Response(null, {
    status: 302,
    headers: {
      Location: dashboardUrl,
      "Set-Cookie": `token=${tokens.id_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    },
  });
});

authRoutes.get("/me", async (c) => {
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

  const payload = await validateJwt(token, {
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    region: process.env.COGNITO_REGION!,
    clientId: process.env.COGNITO_CLIENT_ID!,
  });

  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const customer = await getCustomer();

  return c.json({
    user: {
      sub: payload.sub,
      email: payload.email,
    },
    customer: customer || null,
  });
});
