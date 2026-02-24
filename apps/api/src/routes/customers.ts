import { Hono } from "hono";
import type { Env } from "../types";
import { authMiddleware } from "../lib/auth";
import {
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer as deleteCustomerDb,
  getMcpConfig,
  createMcpConfig,
  updateMcpConfig,
  deleteMcpConfig,
} from "../db/queries";

export const customerRoutes = new Hono<Env>();

// All routes require authentication
customerRoutes.use("*", authMiddleware);

customerRoutes.get("/me", async (c) => {
  const customer = await getCustomer();
  const mcpConfig = await getMcpConfig();
  return c.json({ customer, mcp_config: mcpConfig });
});

customerRoutes.put("/me", async (c) => {
  const body = await c.req.json<{
    email?: string;
    domain?: string;
    mcp_config?: {
      mcp_url?: string;
      oidc_discovery_url?: string;
      allowed_audiences?: string;
    };
  }>();

  const customer = await getCustomer();

  // Create customer if it doesn't exist
  if (!customer) {
    const userId = c.get("userId");
    const email = c.get("email");
    await createCustomer({
      id: crypto.randomUUID(),
      user_id: userId,
      email,
      domain: body.domain,
    });
  } else {
    const { mcp_config: _mcpUpdate, ...customerUpdate } = body;
    if (Object.keys(customerUpdate).length > 0) {
      await updateCustomer(customerUpdate);
    }
  }

  // Update or create MCP config
  const mcpUpdate = body.mcp_config;
  if (mcpUpdate) {
    const existingConfig = await getMcpConfig();
    if (existingConfig) {
      await updateMcpConfig(mcpUpdate);
    } else if (mcpUpdate.mcp_url || mcpUpdate.oidc_discovery_url) {
      await createMcpConfig({
        id: crypto.randomUUID(),
        mcp_url: mcpUpdate.mcp_url || "",
        oidc_discovery_url: mcpUpdate.oidc_discovery_url || "",
        allowed_audiences: mcpUpdate.allowed_audiences,
      });
    }
  }

  const updated = await getCustomer();
  const updatedMcp = await getMcpConfig();
  return c.json({ customer: updated, mcp_config: updatedMcp });
});

customerRoutes.delete("/me", async (c) => {
  await deleteCustomerDb();
  return c.json({ success: true });
});

customerRoutes.get("/snippet", async (c) => {
  const customer = await getCustomer();
  if (!customer) {
    return c.json({ error: "No configuration found" }, 404);
  }

  const mcpConfig = await getMcpConfig();
  if (!mcpConfig) {
    return c.json({ error: "MCP configuration not found" }, 404);
  }

  const runtimeUrl = process.env.AGENTCORE_RUNTIME_URL;
  if (!runtimeUrl) {
    return c.json({ error: "Runtime not configured" }, 400);
  }

  const snippet = `<!-- Agent77 Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${process.env.DASHBOARD_URL?.replace(/\/dashboard$/, "")}/widget.js';
  s.setAttribute('data-runtime-url', '${runtimeUrl}');
  s.async = true;
  document.head.appendChild(s);
})();
</script>`;

  return c.json({ snippet, runtime_url: runtimeUrl });
});
