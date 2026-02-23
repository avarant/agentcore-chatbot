import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.DYNAMODB_TABLE || "agent77-config";

// Single-tenant: one customer record and one MCP config record

export async function getCustomer() {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "PROFILE" },
    })
  );
  return res.Item || null;
}

export async function createCustomer(data: {
  id: string;
  user_id: string;
  email: string;
  domain?: string;
}) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: "CUSTOMER",
        SK: "PROFILE",
        id: data.id,
        user_id: data.user_id,
        email: data.email,
        domain: data.domain || null,
        status: "active",
        created_at: new Date().toISOString(),
      },
    })
  );
}

export async function updateCustomer(
  data: Partial<{
    email: string;
    domain: string;
    status: string;
  }>
) {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const attr = `#${key}`;
      const val = `:${key}`;
      sets.push(`${attr} = ${val}`);
      names[attr] = key;
      values[val] = value;
    }
  }
  if (sets.length === 0) return;

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "PROFILE" },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function deleteCustomer() {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "MCP_CONFIG" },
    })
  );
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "PROFILE" },
    })
  );
}

export async function getMcpConfig() {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "MCP_CONFIG" },
    })
  );
  return res.Item || null;
}

export async function createMcpConfig(data: {
  id: string;
  mcp_url: string;
  oidc_discovery_url: string;
  allowed_audiences?: string;
}) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: "CUSTOMER",
        SK: "MCP_CONFIG",
        id: data.id,
        mcp_url: data.mcp_url,
        oidc_discovery_url: data.oidc_discovery_url,
        allowed_audiences: data.allowed_audiences || null,
        created_at: new Date().toISOString(),
      },
    })
  );
}

export async function updateMcpConfig(
  data: Partial<{
    mcp_url: string;
    oidc_discovery_url: string;
    allowed_audiences: string;
  }>
) {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const attr = `#${key}`;
      const val = `:${key}`;
      sets.push(`${attr} = ${val}`);
      names[attr] = key;
      values[val] = value;
    }
  }
  if (sets.length === 0) return;

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "MCP_CONFIG" },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function deleteMcpConfig() {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: "CUSTOMER", SK: "MCP_CONFIG" },
    })
  );
}
