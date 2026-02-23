import { Hono } from "hono";
import type { Env } from "../types";
import { authMiddleware } from "../lib/auth";
import {
  createAgentRuntime,
  deleteAgentRuntime,
} from "../lib/agentcore";
import {
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer as deleteCustomerDb,
  getMcpConfig,
  createMcpConfig,
  updateMcpConfig,
} from "../db/queries";

export const customerRoutes = new Hono<Env>();

// All routes require authentication
customerRoutes.use("*", authMiddleware);

customerRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const email = c.get("email");
  const body = await c.req.json<{ domain?: string }>();

  const id = crypto.randomUUID();
  await createCustomer(c.env.DB, {
    id,
    user_id: userId,
    email,
    domain: body.domain,
  });

  const customer = await getCustomer(c.env.DB, id);
  return c.json({ customer }, 201);
});

customerRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const customer = await getCustomer(c.env.DB, id);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  if ((customer as Record<string, unknown>).user_id !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const mcpConfig = await getMcpConfig(c.env.DB, id);

  return c.json({ customer, mcp_config: mcpConfig || null });
});

customerRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const customer = await getCustomer(c.env.DB, id);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  if ((customer as Record<string, unknown>).user_id !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    email?: string;
    domain?: string;
    plan?: string;
    mcp_config?: {
      mcp_url?: string;
      oidc_discovery_url?: string;
      allowed_audiences?: string;
      auth_method?: string;
    };
  }>();

  // Update customer fields
  const { mcp_config: mcpUpdate, ...customerUpdate } = body;
  if (Object.keys(customerUpdate).length > 0) {
    await updateCustomer(c.env.DB, id, customerUpdate);
  }

  // Update or create MCP config
  if (mcpUpdate) {
    const existingConfig = await getMcpConfig(c.env.DB, id);
    if (existingConfig) {
      await updateMcpConfig(c.env.DB, id, mcpUpdate);
    } else if (mcpUpdate.mcp_url && mcpUpdate.oidc_discovery_url) {
      await createMcpConfig(c.env.DB, {
        id: crypto.randomUUID(),
        customer_id: id,
        mcp_url: mcpUpdate.mcp_url,
        oidc_discovery_url: mcpUpdate.oidc_discovery_url,
        allowed_audiences: mcpUpdate.allowed_audiences,
      });
    }
  }

  const updated = await getCustomer(c.env.DB, id);
  const updatedMcp = await getMcpConfig(c.env.DB, id);
  return c.json({ customer: updated, mcp_config: updatedMcp || null });
});

customerRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const customer = await getCustomer(c.env.DB, id);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  if ((customer as Record<string, unknown>).user_id !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Delete AgentCore runtime if one exists
  const mcpConfig = await getMcpConfig(c.env.DB, id);
  if (mcpConfig && (mcpConfig as Record<string, unknown>).runtime_arn) {
    try {
      await deleteAgentRuntime(
        (mcpConfig as Record<string, unknown>).runtime_arn as string,
        {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
          region: c.env.AWS_REGION,
        }
      );
    } catch {
      // Log but don't block deletion if runtime cleanup fails
    }
  }

  await deleteCustomerDb(c.env.DB, id);
  return c.json({ success: true });
});

customerRoutes.post("/:id/provision", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const customer = await getCustomer(c.env.DB, id);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  if ((customer as Record<string, unknown>).user_id !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const mcpConfig = await getMcpConfig(c.env.DB, id);
  if (!mcpConfig) {
    return c.json({ error: "MCP configuration required before provisioning" }, 400);
  }

  const config = mcpConfig as Record<string, unknown>;
  if (config.runtime_arn) {
    return c.json({ error: "Runtime already provisioned" }, 409);
  }

  const result = await createAgentRuntime({
    customerId: id,
    mcpUrl: config.mcp_url as string,
    oidcDiscoveryUrl: config.oidc_discovery_url as string,
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
      region: c.env.AWS_REGION,
    },
  });

  await updateMcpConfig(c.env.DB, id, { runtime_arn: result.runtimeArn });
  await updateCustomer(c.env.DB, id, { status: "active" });

  return c.json({ success: true, runtime_arn: result.runtimeArn });
});

customerRoutes.get("/:id/snippet", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const customer = await getCustomer(c.env.DB, id);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  if ((customer as Record<string, unknown>).user_id !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const mcpConfig = await getMcpConfig(c.env.DB, id);
  if (!mcpConfig) {
    return c.json({ error: "MCP configuration not found" }, 404);
  }

  const config = mcpConfig as Record<string, unknown>;
  if (!config.runtime_arn) {
    return c.json({ error: "Runtime not provisioned yet" }, 400);
  }

  // Extract runtime endpoint from ARN
  const runtimeId = (config.runtime_arn as string).split("/").pop();
  const runtimeUrl = `https://agentcore.${c.env.AWS_REGION}.amazonaws.com/runtimes/${runtimeId}`;

  const snippet = `<!-- Agent77 Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = 'https://cdn.agent77.ai/widget.js';
  s.setAttribute('data-customer-id', '${id}');
  s.setAttribute('data-runtime-url', '${runtimeUrl}');
  s.async = true;
  document.head.appendChild(s);
})();
</script>`;

  return c.json({ snippet, runtime_url: runtimeUrl });
});
