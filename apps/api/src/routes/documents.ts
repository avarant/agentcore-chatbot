import { Hono } from "hono";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
  GetIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import type { Env } from "../types";
import { dashboardAuth } from "../lib/auth";

export const documentRoutes = new Hono<Env>();

documentRoutes.use("*", dashboardAuth);

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const bedrockAgent = new BedrockAgentClient({
  region: process.env.AWS_REGION || "us-east-1",
});

// List uploaded documents
documentRoutes.get("/", async (c) => {
  const bucket = process.env.KB_DOCS_BUCKET;
  if (!bucket) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket })
  );

  const documents = (result.Contents || []).map((obj) => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified?.toISOString(),
  }));

  return c.json({ documents });
});

// Generate presigned URL for upload
documentRoutes.post("/upload", async (c) => {
  const bucket = process.env.KB_DOCS_BUCKET;
  if (!bucket) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const body = await c.req.json<{ fileName: string; contentType: string }>();
  if (!body.fileName) {
    return c.json({ error: "fileName is required" }, 400);
  }

  const key = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = body.contentType || "application/octet-stream";

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return c.json({ uploadUrl, key });
});

// Trigger knowledge base sync (ingestion job)
documentRoutes.post("/sync", async (c) => {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const dataSourceId = process.env.KB_DATA_SOURCE_ID;

  if (!knowledgeBaseId || !dataSourceId) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const result = await bedrockAgent.send(
    new StartIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
    })
  );

  return c.json({
    ingestionJobId: result.ingestionJob?.ingestionJobId,
    status: result.ingestionJob?.status,
  });
});

// Check ingestion job status
documentRoutes.get("/sync-status/:jobId", async (c) => {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const dataSourceId = process.env.KB_DATA_SOURCE_ID;

  if (!knowledgeBaseId || !dataSourceId) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const jobId = c.req.param("jobId");

  const result = await bedrockAgent.send(
    new GetIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
      ingestionJobId: jobId,
    })
  );

  return c.json({
    ingestionJobId: result.ingestionJob?.ingestionJobId,
    status: result.ingestionJob?.status,
    statistics: result.ingestionJob?.statistics,
  });
});

// Generate presigned URL for viewing/downloading a document
documentRoutes.get("/view/:key", async (c) => {
  const bucket = process.env.KB_DOCS_BUCKET;
  if (!bucket) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const key = c.req.param("key");

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });

  return c.json({ url });
});

// Delete a document
documentRoutes.delete("/:key", async (c) => {
  const bucket = process.env.KB_DOCS_BUCKET;
  if (!bucket) {
    return c.json({ error: "Knowledge base not configured" }, 503);
  }

  const key = c.req.param("key");

  await s3.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );

  return c.json({ deleted: key });
});
