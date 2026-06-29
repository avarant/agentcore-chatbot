import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { conversationRoutes } from "./routes/conversations";
import { documentRoutes } from "./routes/documents";
import { promptRoutes } from "./routes/prompts";
import {
  insightsRoutes,
  generateInsightsAllSites,
  runInsightsForSite,
} from "./routes/insights";
import { dashboardAuth } from "./lib/auth";
import { listSites } from "./lib/sites";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/conversations", conversationRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/insights", insightsRoutes);
app.route("/api/prompts", promptRoutes);

app.get("/api/sites", dashboardAuth, (c) => {
  const sites = listSites().map(({ id, name, kbBucket }) => ({
    id,
    name,
    hasKnowledgeBase: !!kbBucket,
  }));
  return c.json({ sites });
});

app.get("/", (c) => c.json({ status: "ok", service: "agentcore-chatbot-api" }));

export default app;

const httpHandler = handle(app);

// Dispatch on event shape: EventBridge scheduled events invoke the weekly
// insights generator; anything else falls through to the Hono/Lambda HTTP
// handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any, context: any): Promise<any> => {
  if (event && typeof event === "object" && event.action === "generate_insights_all_sites") {
    await generateInsightsAllSites();
    return { ok: true };
  }
  // Manual single-site run:
  // aws lambda invoke --payload '{"action":"generate_insights_site","siteId":"..."}'
  if (event && typeof event === "object" && event.action === "generate_insights_site" && event.siteId) {
    await runInsightsForSite(String(event.siteId));
    return { ok: true };
  }
  return httpHandler(event, context);
};

// Local dev server
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  import("@hono/node-server").then(({ serve }) => {
    const port = Number(process.env.PORT) || 8787;
    serve({ fetch: app.fetch, port });
    console.log(`API running on http://localhost:${port}`);
  });
}
