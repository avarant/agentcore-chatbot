import { Hono } from "hono";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type { Env } from "../types";
import { authMiddleware } from "../lib/auth";

export const chatRoutes = new Hono<Env>();

chatRoutes.use("*", authMiddleware);

const client = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || "us-east-1",
});

chatRoutes.post("/", async (c) => {
  const endpointArn = process.env.AGENTCORE_ENDPOINT_ARN;
  if (!endpointArn) {
    return c.json({ error: "AgentCore endpoint not configured" }, 503);
  }

  const body = await c.req.json<{ prompt: string }>();
  if (!body.prompt) {
    return c.json({ error: "Missing prompt" }, 400);
  }

  // Extract the runtime ARN from the endpoint ARN
  // Endpoint ARN: arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID/runtime-endpoint/ENDPOINT_NAME
  // Runtime ARN:  arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID
  const runtimeArn = endpointArn.includes("/runtime-endpoint/")
    ? endpointArn.split("/runtime-endpoint/")[0]
    : endpointArn;

  const payload = JSON.stringify({ message: body.prompt });

  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: runtimeArn,
      payload: new TextEncoder().encode(payload),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await client.send(command);

    let responseText = "";
    if (response.payload) {
      const decoded = new TextDecoder().decode(response.payload);
      try {
        const parsed = JSON.parse(decoded);
        responseText = parsed.response || parsed.body || decoded;
        if (typeof responseText !== "string") {
          responseText = JSON.stringify(responseText);
        }
      } catch {
        responseText = decoded;
      }
    }

    return c.json({ response: responseText });
  } catch (err: unknown) {
    const error = err as Error;
    return c.json(
      { error: "AgentCore invocation failed", details: error.message || String(err) },
      502
    );
  }
});
