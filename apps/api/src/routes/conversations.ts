import { Hono } from "hono";
import {
  BedrockAgentCoreClient,
  ListActorsCommand,
  ListSessionsCommand,
  ListEventsCommand,
  ListMemoryRecordsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type { Env } from "../types";
import { dashboardAuth } from "../lib/auth";

export const conversationRoutes = new Hono<Env>();

conversationRoutes.use("*", dashboardAuth);

const client = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// AgentCore actorId only allows [a-zA-Z0-9][a-zA-Z0-9-_/]*
function sanitizeActorId(email: string): string {
  return email.replace(/[^a-zA-Z0-9-_/]/g, "_");
}

// List all sessions (paginated, sorted by most recent)
conversationRoutes.get("/", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10) || 20, 1), 100);
  const cursor = c.req.query("cursor") || undefined;

  // Dashboard shows all conversations — list all actors
  // Optional user_id filter narrows to a specific user
  const userIdFilter = c.req.query("user_id");
  let actorIds: string[];

  if (userIdFilter) {
    actorIds = [sanitizeActorId(userIdFilter)];
  } else {
    try {
      const actorsResult = await client.send(
        new ListActorsCommand({ memoryId, maxResults: 100 })
      );
      actorIds = (actorsResult.actorSummaries || [])
        .map((a) => a.actorId)
        .filter((id): id is string => !!id);
    } catch {
      actorIds = ["anonymous"];
    }
  }

  const allSessions: { session_id: string; actor_id: string; created_at: string; summary: string | null }[] = [];
  let nextCursor: string | null = null;

  for (const aid of actorIds) {
    try {
      const result = await client.send(
        new ListSessionsCommand({
          memoryId,
          actorId: aid,
          maxResults: limit,
          ...(cursor ? { nextToken: cursor } : {}),
        })
      );
      for (const s of result.sessionSummaries || []) {
        allSessions.push({
          session_id: s.sessionId || "",
          actor_id: s.actorId || aid,
          created_at: s.createdAt?.toISOString() || "",
          summary: null,
        });
      }
      if (result.nextToken) {
        nextCursor = result.nextToken;
      }
    } catch {
      // actor not found or no sessions — skip
    }
  }

  // Fetch summaries for each actor's sessions (namespace: /summaries/{actorId}/{sessionId})
  const summaryMap = new Map<string, string>();
  for (const aid of actorIds) {
    try {
      const records = await client.send(
        new ListMemoryRecordsCommand({
          memoryId,
          namespace: `/summaries/${aid}/`,
        })
      );
      for (const r of records.memoryRecordSummaries || []) {
        // Extract sessionId from namespace like /summaries/{actorId}/{sessionId}
        const ns = (r.namespaces || [])[0] || "";
        const parts = ns.split("/");
        const sid = parts[parts.length - 1];
        if (sid && r.content?.text) {
          // Strip XML tags (e.g. <topic name="...">) from summarization output
          const cleaned = r.content.text.replace(/<[^>]+>/g, "").trim();
          summaryMap.set(sid, cleaned);
        }
      }
    } catch {
      // summaries not available — skip
    }
  }

  // Attach summaries to sessions
  for (const s of allSessions) {
    s.summary = summaryMap.get(s.session_id) || null;
  }

  // Sort by created_at descending (most recent first)
  allSessions.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return c.json({ sessions: allSessions, nextCursor });
});

// Get messages for a specific session
conversationRoutes.get("/:sessionId", async (c) => {
  const memoryId = process.env.AGENTCORE_MEMORY_ID;
  if (!memoryId) {
    return c.json({ error: "Memory not configured" }, 503);
  }

  const sessionId = c.req.param("sessionId");

  // Try all actors to find the session
  let actorIds: string[];
  const userIdFilter = c.req.query("user_id");

  if (userIdFilter) {
    actorIds = [sanitizeActorId(userIdFilter)];
  } else {
    try {
      const actorsResult = await client.send(
        new ListActorsCommand({ memoryId, maxResults: 100 })
      );
      actorIds = (actorsResult.actorSummaries || [])
        .map((a) => a.actorId)
        .filter((id): id is string => !!id);
    } catch {
      actorIds = ["anonymous"];
    }
  }

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
