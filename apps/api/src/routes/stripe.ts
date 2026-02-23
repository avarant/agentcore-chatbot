import { Hono } from "hono";
import type { Env } from "../types";
import { updateCustomerStatus, getCustomerByUserId } from "../db/queries";

export const stripeRoutes = new Hono<Env>();

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Stripe signature format: t=timestamp,v1=signature
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !sig) return false;

  // Verify signature using HMAC-SHA256
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expectedHex = [...new Uint8Array(expected)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison
  if (expectedHex.length !== sig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}

stripeRoutes.post("/webhook", async (c) => {
  const signature = c.req.header("Stripe-Signature");
  if (!signature) {
    return c.json({ error: "Missing Stripe-Signature header" }, 400);
  }

  const body = await c.req.text();

  const valid = await verifyStripeSignature(
    body,
    signature,
    c.env.STRIPE_WEBHOOK_SECRET
  );
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(body) as {
    type: string;
    data: {
      object: Record<string, unknown>;
    };
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id as string;
      if (userId) {
        const customer = await getCustomerByUserId(c.env.DB, userId);
        if (customer) {
          await updateCustomerStatus(c.env.DB, userId, "active");
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const metadata = subscription.metadata as
        | Record<string, string>
        | undefined;
      const userId = metadata?.user_id;
      if (userId) {
        await updateCustomerStatus(c.env.DB, userId, "cancelled");
      }
      break;
    }
  }

  return c.json({ received: true });
});
