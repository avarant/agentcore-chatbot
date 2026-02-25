import { Hono } from "hono";
import {
  BedrockAgentCoreClient,
  ListSessionsCommand,
  ListEventsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type { Env } from "../types";
import { authMiddleware } from "../lib/auth";

export const conversationRoutes = new Hono<Env>();

conversationRoutes.use("*", authMiddleware);

const client = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// List all sessions for the current user
conversationRoutes.get("/", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const actorId = c.get("email") || "anonymous";

  const result = await client.send(
    new ListSessionsCommand({
      memoryId,
      actorId,
    })
  );

  return c.json({
    sessions: (result.sessionSummaries || []).map((s) => ({
      session_id: s.sessionId,
      actor_id: s.actorId,
      created_at: s.createdAt?.toISOString(),
    })),
  });
});

// Get messages for a specific session
conversationRoutes.get("/:sessionId", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const sessionId = c.req.param("sessionId");
  const actorId = c.get("email") || "anonymous";

  const result = await client.send(
    new ListEventsCommand({
      memoryId,
      actorId,
      sessionId,
    })
  );

  // Extract conversational messages from events
  const messages: { role: string; content: string; timestamp: string }[] = [];

  for (const event of result.events || []) {
    for (const payload of event.payload || []) {
      if (payload.conversational) {
        try {
          const parsed = JSON.parse(payload.conversational.content?.text || "{}");
          const text =
            parsed.message?.content?.[0]?.text || parsed.message?.content || "";
          if (text) {
            messages.push({
              role: payload.conversational.role === "USER" ? "user" : "assistant",
              content: text,
              timestamp: event.eventTimestamp?.toISOString() || "",
            });
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }

  // Sort chronologically
  messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return c.json({ session_id: sessionId, messages });
});
