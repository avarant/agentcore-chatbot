import { Hono } from "hono";
import type { Env } from "../types";
import { validateJwt } from "../lib/auth";
import { getCustomerByUserId, createCustomer } from "../db/queries";

export const authRoutes = new Hono<Env>();

authRoutes.post("/callback", async (c) => {
  const { code, redirect_uri } = await c.req.json<{
    code: string;
    redirect_uri?: string;
  }>();

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  // Exchange auth code for tokens with Cognito
  const tokenUrl = `https://${c.env.COGNITO_DOMAIN}/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.env.COGNITO_CLIENT_ID,
    client_secret: c.env.COGNITO_CLIENT_SECRET,
    code,
    redirect_uri: redirect_uri || c.env.COGNITO_REDIRECT_URI,
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
  const payload = await validateJwt(
    tokens.id_token,
    {
      userPoolId: c.env.COGNITO_USER_POOL_ID,
      region: c.env.COGNITO_REGION,
      clientId: c.env.COGNITO_CLIENT_ID,
    },
    c.env.CACHE
  );

  if (!payload) {
    return c.json({ error: "Invalid ID token" }, 401);
  }

  // Create or update customer in D1
  const existing = await getCustomerByUserId(c.env.DB, payload.sub);
  if (!existing) {
    await createCustomer(c.env.DB, {
      id: crypto.randomUUID(),
      user_id: payload.sub,
      email: payload.email,
    });
  }

  // Set JWT cookie
  const maxAge = tokens.expires_in || 3600;
  c.header(
    "Set-Cookie",
    `token=${tokens.id_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );

  return c.json({
    user: { sub: payload.sub, email: payload.email },
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
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

  const payload = await validateJwt(
    token,
    {
      userPoolId: c.env.COGNITO_USER_POOL_ID,
      region: c.env.COGNITO_REGION,
      clientId: c.env.COGNITO_CLIENT_ID,
    },
    c.env.CACHE
  );

  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const customer = await getCustomerByUserId(c.env.DB, payload.sub);

  return c.json({
    user: {
      sub: payload.sub,
      email: payload.email,
    },
    customer: customer || null,
  });
});
