import {
  BedrockAgentCoreClient,
  ListActorsCommand,
  ListSessionsCommand,
  type SessionSummary,
} from "@aws-sdk/client-bedrock-agentcore";

// Page through ListActors until exhausted or until `max` actors collected.
export async function listAllActors(
  client: BedrockAgentCoreClient,
  memoryId: string,
  max = 1000
): Promise<string[]> {
  const actors: string[] = [];
  let nextToken: string | undefined;

  do {
    const result = await client.send(
      new ListActorsCommand({
        memoryId,
        maxResults: 100,
        ...(nextToken ? { nextToken } : {}),
      })
    );
    for (const a of result.actorSummaries || []) {
      if (a.actorId) actors.push(a.actorId);
      if (actors.length >= max) return actors;
    }
    nextToken = result.nextToken;
  } while (nextToken);

  return actors;
}

// AgentCore returns sessions ordered by sessionId (UUID), not by createdAt.
// Recency-sorted views must page through all sessions and sort client-side,
// otherwise recent sessions whose UUIDs sort late are silently dropped.
export async function listAllSessions(
  client: BedrockAgentCoreClient,
  memoryId: string,
  actorId: string,
  max = 1000
): Promise<SessionSummary[]> {
  const sessions: SessionSummary[] = [];
  let nextToken: string | undefined;

  do {
    const result = await client.send(
      new ListSessionsCommand({
        memoryId,
        actorId,
        maxResults: 100,
        ...(nextToken ? { nextToken } : {}),
      })
    );
    for (const s of result.sessionSummaries || []) {
      sessions.push(s);
      if (sessions.length >= max) return sessions;
    }
    nextToken = result.nextToken;
  } while (nextToken);

  return sessions;
}
