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

  const runtimeArn = endpointArn.includes("/runtime-endpoint/")
    ? endpointArn.split("/runtime-endpoint/")[0]
    : endpointArn;

  const payload = JSON.stringify({ prompt: body.prompt });

  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: runtimeArn,
      payload: new TextEncoder().encode(payload),
      contentType: "application/json",
      accept: "application/json",
    });

    const result = await client.send(command);

    // The SDK returns `response` as a readable stream, not `payload`
    const stream = (result as any).response;
    let responseText = "";

    if (stream) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else if (chunk?.bytes) {
          chunks.push(chunk.bytes);
        } else if (chunk?.chunk?.bytes) {
          chunks.push(chunk.chunk.bytes);
        }
      }
      const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const decoded = new TextDecoder().decode(merged);

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
    console.error("AgentCore invocation error:", error.name, error.message);
    return c.json(
      { error: "AgentCore invocation failed", details: error.message || String(err) },
      502
    );
  }
});
