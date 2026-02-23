CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  domain TEXT,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE mcp_configs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  mcp_url TEXT NOT NULL,
  oidc_discovery_url TEXT NOT NULL,
  allowed_audiences TEXT,
  runtime_arn TEXT,
  auth_method TEXT DEFAULT 'jwt',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  month TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  UNIQUE(customer_id, month)
);
