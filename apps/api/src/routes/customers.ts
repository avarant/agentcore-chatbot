import { Hono } from "hono";
import type { Env } from "../types";
import { authMiddleware } from "../lib/auth";
import { getCustomer, createCustomer } from "../db/queries";

export const customerRoutes = new Hono<Env>();

// All routes require authentication
customerRoutes.use("*", authMiddleware);

customerRoutes.get("/me", async (c) => {
  const customer = await getCustomer();
  return c.json({ customer });
});

customerRoutes.get("/snippet", async (c) => {
  const runtimeUrl = process.env.AGENTCORE_RUNTIME_URL;
  if (!runtimeUrl) {
    return c.json({ error: "Runtime not configured" }, 400);
  }

  const dashboardUrl = process.env.DASHBOARD_URL?.replace(/\/dashboard$/, "") || "";

  const snippet = `<!-- Agent77 Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${dashboardUrl}/widget.js';
  s.setAttribute('data-runtime-url', '${runtimeUrl}');
  s.async = true;
  document.head.appendChild(s);
})();
</script>`;

  return c.json({ snippet });
});
