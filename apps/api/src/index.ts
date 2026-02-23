import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { customerRoutes } from "./routes/customers";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: process.env.DASHBOARD_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/customers", customerRoutes);

app.get("/", (c) => c.json({ status: "ok", service: "agent77-api" }));

export default app;
export const handler = handle(app);
