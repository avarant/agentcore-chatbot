import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { conversationRoutes } from "./routes/conversations";
import { documentRoutes } from "./routes/documents";
import { promptRoutes } from "./routes/prompts";
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
app.route("/api/prompts", promptRoutes);

app.get("/api/sites", dashboardAuth, (c) => {
  const sites = listSites().map(({ id, name, kbBucket }) => ({
    id,
    name,
    hasKnowledgeBase: !!kbBucket,
  }));
  return c.json({ sites });
});

app.get("/", (c) => c.json({ status: "ok", service: "agent77-api" }));

export default app;
export const handler = handle(app);

// Local dev server
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  import("@hono/node-server").then(({ serve }) => {
    const port = Number(process.env.PORT) || 8787;
    serve({ fetch: app.fetch, port });
    console.log(`API running on http://localhost:${port}`);
  });
}
