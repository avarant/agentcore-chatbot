// AWS AgentCore API calls with SigV4 signing (Web Crypto, no Node.js deps)

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  data: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return hexEncode(hash);
}

function hexEncode(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode("AWS4" + secretKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signRequest(
  method: string,
  url: string,
  body: string,
  credentials: AwsCredentials,
  service: string
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = parsedUrl.pathname;
  const canonicalQuerystring = parsedUrl.searchParams.toString();

  const payloadHash = await sha256(body);
  const host = parsedUrl.host;

  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalHeaders = [
    `content-type:application/x-amz-json-1.0`,
    `host:${host}`,
    `x-amz-date:${amzDate}`,
  ].join("\n");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    credentials.region,
    service
  );
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = hexEncode(signatureBuffer);

  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "X-Amz-Date": amzDate,
    "Content-Type": "application/x-amz-json-1.0",
  };
}

const SERVICE = "bedrock-agentcore";

function getEndpoint(region: string): string {
  return `https://agentcore.${region}.amazonaws.com`;
}

export async function createAgentRuntime(config: {
  customerId: string;
  mcpUrl: string;
  oidcDiscoveryUrl: string;
  credentials: AwsCredentials;
}): Promise<{ runtimeArn: string }> {
  const { credentials } = config;
  const endpoint = getEndpoint(credentials.region);
  const url = `${endpoint}/runtimes`;

  const body = JSON.stringify({
    agentRuntimeName: `agent77-${config.customerId}`,
    agentRuntimeArtifact: {
      containerConfiguration: {
        containerUri: config.mcpUrl,
      },
    },
    networkConfiguration: {
      networkMode: "PUBLIC",
    },
    protocolConfiguration: {
      serverProtocol: "MCP",
    },
    authorizationConfiguration: {
      authorizationType: "JWT_BEARER",
      jwtBearerConfiguration: {
        discoveryUrl: config.oidcDiscoveryUrl,
      },
    },
  });

  const headers = await signRequest("POST", url, body, credentials, SERVICE);
  const res = await fetch(url, { method: "POST", headers, body });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`CreateAgentRuntime failed (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as { agentRuntimeArn: string };
  return { runtimeArn: data.agentRuntimeArn };
}

export async function deleteAgentRuntime(
  runtimeArn: string,
  credentials: AwsCredentials
): Promise<{ success: boolean }> {
  const endpoint = getEndpoint(credentials.region);
  // Extract runtime ID from ARN
  const runtimeId = runtimeArn.split("/").pop();
  const url = `${endpoint}/runtimes/${runtimeId}`;
  const body = "";

  const headers = await signRequest("DELETE", url, body, credentials, SERVICE);
  const res = await fetch(url, { method: "DELETE", headers, body });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`DeleteAgentRuntime failed (${res.status}): ${errBody}`);
  }

  return { success: true };
}

export async function getAgentRuntimeStatus(
  runtimeArn: string,
  credentials: AwsCredentials
): Promise<{ status: string }> {
  const endpoint = getEndpoint(credentials.region);
  const runtimeId = runtimeArn.split("/").pop();
  const url = `${endpoint}/runtimes/${runtimeId}`;
  const body = "";

  const headers = await signRequest("GET", url, body, credentials, SERVICE);
  const res = await fetch(url, { method: "GET", headers, body });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GetAgentRuntime failed (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as { status: string };
  return { status: data.status };
}
