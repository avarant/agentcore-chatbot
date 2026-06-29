import { Hono } from "hono";
import {
  BedrockAgentCoreClient,
  ListEventsCommand,
  ListMemoryRecordsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Env } from "../types";
import { dashboardAuth } from "../lib/auth";
import { getSite, listSites } from "../lib/sites";
import { listAllActors, listAllSessions } from "../lib/agentcore";

export const insightsRoutes = new Hono<Env>();

const region = process.env.AWS_REGION_NAME || process.env.AWS_REGION || "us-east-1";
const agentcore = new BedrockAgentCoreClient({ region });
const bedrock = new BedrockRuntimeClient({ region });
const dynamo = new DynamoDBClient({ region });

const INSIGHTS_VERSION = "v1";
const MAX_SESSIONS = 200;
const MAX_MESSAGE_CHARS = 500;

export type RecurringQuestion = {
  question: string;
  count: number;
  example_session_ids: string[];
};

export type FrictionTheme = {
  theme: string;
  description: string;
  affected_count: number;
  example_session_ids: string[];
};

export type TopTopic = {
  topic: string;
  count: number;
};

export type InsightsPayload = {
  generated_at: string;
  session_count: number;
  recurring_questions: RecurringQuestion[];
  friction_themes: FrictionTheme[];
  top_topics: TopTopic[];
};

insightsRoutes.use("*", dashboardAuth);

// ---------------------------------------------------------------------------
// Read cached insights for a site
// ---------------------------------------------------------------------------

insightsRoutes.get("/", async (c) => {
  const site = getSite(c.req.query("site"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const table = process.env.INSIGHTS_TABLE;
  if (!table) return c.json({ error: "Insights not configured" }, 503);

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: table,
      Key: {
        siteId: { S: site.id },
        version: { S: INSIGHTS_VERSION },
      },
    })
  );

  if (!result.Item?.payload?.S) {
    return c.json({ error: "No insights generated yet" }, 404);
  }

  try {
    const payload = JSON.parse(result.Item.payload.S) as InsightsPayload;
    return c.json(payload);
  } catch {
    return c.json({ error: "Cached payload is malformed" }, 500);
  }
});

type SessionBlock = {
  sessionId: string;
  actorId: string;
  createdAt: string;
  summary: string;
  firstMessages: string[];
};

async function collectSessionBlocks(memoryId: string): Promise<SessionBlock[]> {
  const actorIds = await listAllActors(agentcore, memoryId);
  type RawSession = { sessionId: string; actorId: string; createdAt: string; summary: string };
  const rawSessions: RawSession[] = [];

  for (const aid of actorIds) {
    let sessionList: { sessionId: string; createdAt?: string }[] = [];
    try {
      const sessions = await listAllSessions(agentcore, memoryId, aid);
      sessionList = sessions.map((s) => ({
        sessionId: s.sessionId || "",
        createdAt: s.createdAt?.toISOString() || "",
      }));
    } catch {
      sessionList = [];
    }

    const summaryMap = new Map<string, string>();
    try {
      const records = await agentcore.send(
        new ListMemoryRecordsCommand({ memoryId, namespace: `/summaries/${aid}/` })
      );
      for (const r of records.memoryRecordSummaries || []) {
        const ns = (r.namespaces || [])[0] || "";
        const parts = ns.split("/");
        const sid = parts[parts.length - 1];
        if (sid && r.content?.text) {
          summaryMap.set(sid, r.content.text.replace(/<[^>]+>/g, "").trim());
        }
      }
    } catch {
      // no summaries for this actor
    }

    for (const s of sessionList) {
      if (!s.sessionId) continue;
      rawSessions.push({
        sessionId: s.sessionId,
        actorId: aid,
        createdAt: s.createdAt || "",
        summary: summaryMap.get(s.sessionId) || "",
      });
    }
  }

  rawSessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const selected = rawSessions.slice(0, MAX_SESSIONS);

  const blocks: SessionBlock[] = [];
  const chunkSize = 8;
  for (let i = 0; i < selected.length; i += chunkSize) {
    const chunk = selected.slice(i, i + chunkSize);
    const resolved = await Promise.all(
      chunk.map(async (s): Promise<SessionBlock> => {
        let firstMessages: string[] = [];
        try {
          const events = await agentcore.send(
            new ListEventsCommand({
              memoryId,
              actorId: s.actorId,
              sessionId: s.sessionId,
              maxResults: 10,
            })
          );
          const userTexts: { ts: number; text: string }[] = [];
          for (const event of events.events || []) {
            for (const payload of event.payload || []) {
              const conv = payload.conversational;
              if (!conv || conv.role !== "USER") continue;
              try {
                const parsed = JSON.parse(conv.content?.text || "{}");
                const content = parsed.message?.content;
                let text = "";
                if (typeof content === "string") {
                  text = content;
                } else if (Array.isArray(content)) {
                  text = content
                    .filter((c: { text?: string }) => c.text)
                    .map((c: { text?: string }) => c.text)
                    .join("\n");
                }
                if (text) {
                  userTexts.push({
                    ts: event.eventTimestamp?.getTime() || 0,
                    text: text.slice(0, MAX_MESSAGE_CHARS),
                  });
                }
              } catch {
                // skip malformed event
              }
            }
          }
          userTexts.sort((a, b) => a.ts - b.ts);
          firstMessages = userTexts.slice(0, 2).map((u) => u.text);
        } catch {
          firstMessages = [];
        }
        return {
          sessionId: s.sessionId,
          actorId: s.actorId,
          createdAt: s.createdAt,
          summary: s.summary,
          firstMessages,
        };
      })
    );
    blocks.push(...resolved);
  }

  return blocks;
}

function buildPrompt(blocks: SessionBlock[]): { system: string; userMessage: Message } {
  const system = [
    "You analyze chatbot conversations to help site owners understand what their end users are struggling with.",
    "Your job: find recurring questions, friction themes, and top topics across the supplied sessions.",
    "Cluster semantically — near-duplicate questions should collapse into one. Use counts from the provided data, do not invent session IDs.",
    "Return structured output via the record_insights tool only. Do not include prose.",
  ].join(" ");

  const sessionLines = blocks.map((b, i) => {
    const msgs = b.firstMessages.length > 0
      ? b.firstMessages.map((m) => JSON.stringify(m)).join(" | ")
      : "(no user messages)";
    const summary = b.summary || "(no summary)";
    return `[${i + 1}] session_id=${b.sessionId}\n  summary: ${summary}\n  first_user_messages: ${msgs}`;
  });

  const userMessage: Message = {
    role: "user",
    content: [
      {
        text: [
          `Analyze ${blocks.length} chatbot conversations listed below. Identify:`,
          "- recurring_questions: up to 10 distinct user questions that appear repeatedly. Provide a concise normalized question text, a count of sessions where it was asked, and up to 5 example session IDs.",
          "- friction_themes: up to 10 topics where users get stuck, confused, or frustrated. Provide a short theme name, a one-sentence description, the number of affected sessions, and up to 5 example session IDs.",
          "- top_topics: up to 12 high-level topic labels with session counts, to give a coarse breakdown of what users talk about.",
          "",
          "Rules: example_session_ids must appear verbatim in the input. Counts must reflect the input data. Prefer the user's actual wording for question text.",
          "",
          "--- SESSIONS ---",
          sessionLines.join("\n\n"),
        ].join("\n"),
      },
    ],
  };

  return { system, userMessage };
}

const insightsTool: Tool = {
  toolSpec: {
    name: "record_insights",
    description:
      "Record the insights derived from the conversations: recurring questions, friction themes, and top topics.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          recurring_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                count: { type: "integer" },
                example_session_ids: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["question", "count", "example_session_ids"],
            },
          },
          friction_themes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                theme: { type: "string" },
                description: { type: "string" },
                affected_count: { type: "integer" },
                example_session_ids: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["theme", "description", "affected_count", "example_session_ids"],
            },
          },
          top_topics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                topic: { type: "string" },
                count: { type: "integer" },
              },
              required: ["topic", "count"],
            },
          },
        },
        required: ["recurring_questions", "friction_themes", "top_topics"],
      },
    },
  },
};

type ToolResult = {
  recurring_questions: RecurringQuestion[];
  friction_themes: FrictionTheme[];
  top_topics: TopTopic[];
};

async function callBedrock(blocks: SessionBlock[]): Promise<ToolResult> {
  const modelId = process.env.BEDROCK_MODEL_ID || "global.anthropic.claude-sonnet-4-6";
  const { system, userMessage } = buildPrompt(blocks);

  const response = await bedrock.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [userMessage],
      toolConfig: {
        tools: [insightsTool],
        toolChoice: { tool: { name: "record_insights" } },
      },
      inferenceConfig: { maxTokens: 4000, temperature: 0 },
    })
  );

  const content = response.output?.message?.content || [];
  for (const block of content) {
    if ("toolUse" in block && block.toolUse) {
      const input = block.toolUse.input as ToolResult | undefined;
      if (!input) break;
      return {
        recurring_questions: Array.isArray(input.recurring_questions) ? input.recurring_questions : [],
        friction_themes: Array.isArray(input.friction_themes) ? input.friction_themes : [],
        top_topics: Array.isArray(input.top_topics) ? input.top_topics : [],
      };
    }
  }
  throw new Error("No tool_use block returned by Bedrock");
}

export async function generateInsightsForSite(siteId: string): Promise<InsightsPayload> {
  const site = getSite(siteId);
  if (!site) throw new Error(`Unknown site ${siteId}`);
  if (!site.memoryId) throw new Error(`Site ${siteId} has no memoryId`);

  const table = process.env.INSIGHTS_TABLE;
  if (!table) throw new Error("INSIGHTS_TABLE env var is not set");

  const blocks = await collectSessionBlocks(site.memoryId);

  let result: ToolResult;
  if (blocks.length === 0) {
    result = { recurring_questions: [], friction_themes: [], top_topics: [] };
  } else {
    result = await callBedrock(blocks);
  }

  const payload: InsightsPayload = {
    generated_at: new Date().toISOString(),
    session_count: blocks.length,
    recurring_questions: result.recurring_questions.slice(0, 10),
    friction_themes: result.friction_themes.slice(0, 10),
    top_topics: result.top_topics.slice(0, 12),
  };

  const ttl = Math.floor(Date.now() / 1000) + 30 * 86400;
  await dynamo.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        siteId: { S: site.id },
        version: { S: INSIGHTS_VERSION },
        generated_at: { S: payload.generated_at },
        session_count: { N: String(payload.session_count) },
        payload: { S: JSON.stringify(payload) },
        ttl: { N: String(ttl) },
      },
    })
  );

  return payload;
}

// Generate + cache insights for one site, catching and logging errors so a
// single failing site never aborts a multi-site scheduled run.
export async function runInsightsForSite(siteId: string): Promise<void> {
  const site = getSite(siteId);
  if (!site) {
    console.error(`[insights] unknown site ${siteId}`);
    return;
  }
  if (!site.memoryId) {
    console.log(`[insights] skipping site ${site.id} — no memoryId`);
    return;
  }
  const start = Date.now();
  try {
    const payload = await generateInsightsForSite(site.id);
    console.log(
      `[insights] site=${site.id} sessions=${payload.session_count} elapsed=${Date.now() - start}ms`
    );
  } catch (err) {
    console.error(`[insights] site=${site.id} failed:`, err);
  }
}

export async function generateInsightsAllSites(): Promise<void> {
  const sites = listSites();
  // Sites run concurrently so one slow site can't starve the rest within the
  // Lambda timeout; each site catches its own errors so allSettled never
  // rejects and every site gets a chance to generate.
  await Promise.allSettled(sites.map((site) => runInsightsForSite(site.id)));
}
