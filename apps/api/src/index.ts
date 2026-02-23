import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { customerRoutes } from "./routes/customers";
import { stripeRoutes } from "./routes/stripe";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: ["https://agent77.app", "http://localhost:3000"],
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/customers", customerRoutes);
app.route("/api/stripe", stripeRoutes);

app.get("/", (c) => c.json({ status: "ok", service: "agent77-api" }));

export default app;
