import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

export interface JwtPayload {
  sub: string;
  email: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  token_use?: string;
}

interface JwksKey {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
  use: string;
}

interface Jwks {
  keys: JwksKey[];
}

// In-memory JWKS cache (survives Lambda container reuse)
const jwksCache = new Map<string, { jwks: Jwks; expiresAt: number }>();
const JWKS_CACHE_TTL = 3600 * 1000; // 1 hour in ms

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchJwks(region: string, userPoolId: string): Promise<Jwks> {
  const cacheKey = `jwks:${userPoolId}`;
  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwks;
  }

  const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);

  const jwks = (await res.json()) as Jwks;
  jwksCache.set(cacheKey, { jwks, expiresAt: Date.now() + JWKS_CACHE_TTL });
  return jwks;
}

async function importJwk(key: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: key.kty, n: key.n, e: key.e, alg: key.alg, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export async function validateJwt(
  token: string,
  config: { userPoolId: string; region: string; clientId: string }
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { kid: string; alg: string };
  let payload: JwtPayload;

  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }

  // Validate claims
  const expectedIss = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  if (payload.iss !== expectedIss) return null;
  if (payload.aud !== config.clientId) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  // Fetch JWKS and find matching key
  const jwks = await fetchJwks(config.region, config.userPoolId);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  // Verify signature
  const cryptoKey = await importJwk(jwk);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    data
  );
  if (!valid) return null;

  return payload;
}

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
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

  c.set("userId", payload.sub);
  c.set("email", payload.email);

  await next();
});
