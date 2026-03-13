import { Hono } from "hono";
import {
  BedrockAgentClient,
  GetPromptCommand,
  UpdatePromptCommand,
} from "@aws-sdk/client-bedrock-agent";
import type { Env } from "../types";
import { dashboardAuth } from "../lib/auth";

export const promptRoutes = new Hono<Env>();

promptRoutes.use("*", dashboardAuth);

const bedrockAgent = new BedrockAgentClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// Get current prompt
promptRoutes.get("/", async (c) => {
  const promptId = process.env.PROMPT_ID;
  if (!promptId) {
    return c.json({ error: "Prompt not configured" }, 503);
  }

  const result = await bedrockAgent.send(
    new GetPromptCommand({ promptIdentifier: promptId })
  );

  const variant = result.variants?.[0];
  const templateConfig = variant?.templateConfiguration;
  const textConfig = templateConfig && "text" in templateConfig ? templateConfig.text : undefined;

  return c.json({
    text: textConfig?.text || "",
    name: result.name,
    description: result.description,
  });
});

// Update prompt text
promptRoutes.put("/", async (c) => {
  const promptId = process.env.PROMPT_ID;
  if (!promptId) {
    return c.json({ error: "Prompt not configured" }, 503);
  }

  const body = await c.req.json<{ text: string }>();
  if (!body.text) {
    return c.json({ error: "text is required" }, 400);
  }

  // Fetch current prompt to preserve structure
  const current = await bedrockAgent.send(
    new GetPromptCommand({ promptIdentifier: promptId })
  );

  await bedrockAgent.send(
    new UpdatePromptCommand({
      promptIdentifier: promptId,
      name: current.name!,
      description: current.description,
      defaultVariant: current.defaultVariant,
      variants: [
        {
          name: current.variants?.[0]?.name || "default",
          templateType: "TEXT",
          modelId: current.variants?.[0]?.modelId,
          templateConfiguration: {
            text: {
              text: body.text,
            },
          },
        },
      ],
    })
  );

  return c.json({ ok: true });
});
