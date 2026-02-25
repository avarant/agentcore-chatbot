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

// AgentCore actorId only allows [a-zA-Z0-9][a-zA-Z0-9-_/]*
function sanitizeActorId(email: string): string {
  return email.replace(/[^a-zA-Z0-9-_/]/g, "_");
}

// List all sessions for the current user
conversationRoutes.get("/", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const actorId = sanitizeActorId(c.get("email") || "anonymous");

  // Try both the sanitized email and "anonymous" (legacy sessions)
  const actorIds = [actorId];
  if (actorId !== "anonymous") actorIds.push("anonymous");

  const allSessions: { session_id: string; actor_id: string; created_at: string }[] = [];

  for (const aid of actorIds) {
    try {
      const result = await client.send(
        new ListSessionsCommand({ memoryId, actorId: aid })
      );
      for (const s of result.sessionSummaries || []) {
        allSessions.push({
          session_id: s.sessionId || "",
          actor_id: s.actorId || aid,
          created_at: s.createdAt?.toISOString() || "",
        });
      }
    } catch {
      // actor not found or no sessions — skip
    }
  }

  return c.json({ sessions: allSessions });
});

// Get messages for a specific session
conversationRoutes.get("/:sessionId", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const sessionId = c.req.param("sessionId");
  const actorId = sanitizeActorId(c.get("email") || "anonymous");

  // Try both sanitized email and "anonymous" as actor
  const actorIds = [actorId];
  if (actorId !== "anonymous") actorIds.push("anonymous");

  const messages: { role: string; content: string; timestamp: string }[] = [];

  for (const aid of actorIds) {
    try {
      const result = await client.send(
        new ListEventsCommand({ memoryId, actorId: aid, sessionId })
      );

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
      if (messages.length > 0) break; // found messages, stop trying
    } catch {
      // actor/session not found — try next
    }
  }

  messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return c.json({ session_id: sessionId, messages });
});
