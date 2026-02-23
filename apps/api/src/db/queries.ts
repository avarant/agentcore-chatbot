import type { Env } from "../types";

type DB = Env["Bindings"]["DB"];

export async function getCustomer(db: DB, id: string) {
  return db.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
}

export async function getCustomerByUserId(db: DB, userId: string) {
  return db
    .prepare("SELECT * FROM customers WHERE user_id = ?")
    .bind(userId)
    .first();
}

export async function createCustomer(
  db: DB,
  data: { id: string; user_id: string; email: string; domain?: string }
) {
  return db
    .prepare(
      "INSERT INTO customers (id, user_id, email, domain) VALUES (?, ?, ?, ?)"
    )
    .bind(data.id, data.user_id, data.email, data.domain ?? null)
    .run();
}

export async function updateCustomer(
  db: DB,
  id: string,
  data: Partial<{
    email: string;
    domain: string;
    plan: string;
    status: string;
  }>
) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length === 0) return;
  values.push(id);
  return db
    .prepare(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteCustomer(db: DB, id: string) {
  await db
    .prepare("DELETE FROM mcp_configs WHERE customer_id = ?")
    .bind(id)
    .run();
  await db
    .prepare("DELETE FROM usage_logs WHERE customer_id = ?")
    .bind(id)
    .run();
  return db.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
}

export async function getMcpConfig(db: DB, customerId: string) {
  return db
    .prepare("SELECT * FROM mcp_configs WHERE customer_id = ?")
    .bind(customerId)
    .first();
}

export async function createMcpConfig(
  db: DB,
  data: {
    id: string;
    customer_id: string;
    mcp_url: string;
    oidc_discovery_url: string;
    allowed_audiences?: string;
    runtime_arn?: string;
  }
) {
  return db
    .prepare(
      "INSERT INTO mcp_configs (id, customer_id, mcp_url, oidc_discovery_url, allowed_audiences, runtime_arn) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      data.id,
      data.customer_id,
      data.mcp_url,
      data.oidc_discovery_url,
      data.allowed_audiences ?? null,
      data.runtime_arn ?? null
    )
    .run();
}

export async function updateMcpConfig(
  db: DB,
  customerId: string,
  data: Partial<{
    mcp_url: string;
    oidc_discovery_url: string;
    allowed_audiences: string;
    runtime_arn: string;
    auth_method: string;
  }>
) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length === 0) return;
  values.push(customerId);
  return db
    .prepare(
      `UPDATE mcp_configs SET ${sets.join(", ")} WHERE customer_id = ?`
    )
    .bind(...values)
    .run();
}

export async function deleteMcpConfig(db: DB, customerId: string) {
  return db
    .prepare("DELETE FROM mcp_configs WHERE customer_id = ?")
    .bind(customerId)
    .run();
}

export async function getCustomerByEmail(db: DB, email: string) {
  return db
    .prepare("SELECT * FROM customers WHERE email = ?")
    .bind(email)
    .first();
}

export async function getUsage(db: DB, customerId: string, month: string) {
  return db
    .prepare(
      "SELECT * FROM usage_logs WHERE customer_id = ? AND month = ?"
    )
    .bind(customerId, month)
    .first();
}

export async function incrementUsage(
  db: DB,
  data: { id: string; customer_id: string; month: string }
) {
  return db
    .prepare(
      `INSERT INTO usage_logs (id, customer_id, month, message_count) VALUES (?, ?, ?, 1)
       ON CONFLICT(customer_id, month) DO UPDATE SET message_count = message_count + 1`
    )
    .bind(data.id, data.customer_id, data.month)
    .run();
}

export async function updateCustomerStatus(
  db: DB,
  userId: string,
  status: string
) {
  return db
    .prepare("UPDATE customers SET status = ? WHERE user_id = ?")
    .bind(status, userId)
    .run();
}
