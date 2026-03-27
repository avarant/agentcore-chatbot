import os
import re
import json
import logging
import base64

# Ensure region is always available for boto3/SDK clients
REGION = os.environ.get("AWS_REGION_NAME") or os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
os.environ.setdefault("AWS_DEFAULT_REGION", REGION)

import boto3
from strands import Agent
from strands_tools import retrieve
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager,
)

logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant. Answer questions clearly and concisely. If a knowledge base is available, use the retrieve tool to search for relevant information from uploaded documents before answering questions."


def _fetch_prompt() -> str:
    """Fetch system prompt from Bedrock Prompt Management, falling back to default."""
    prompt_id = os.environ.get("PROMPT_ID", "")
    if not prompt_id:
        return DEFAULT_SYSTEM_PROMPT
    try:
        client = boto3.client("bedrock-agent", region_name=REGION)
        resp = client.get_prompt(promptIdentifier=prompt_id)
        for variant in resp.get("variants", []):
            tc = variant.get("templateConfiguration", {})
            text_config = tc.get("text", {})
            if text_config.get("text"):
                return text_config["text"]
        logger.warning("No text template found in prompt %s, using default", prompt_id)
        return DEFAULT_SYSTEM_PROMPT
    except Exception:
        logger.exception("Failed to fetch prompt %s, using default", prompt_id)
        return DEFAULT_SYSTEM_PROMPT


SYSTEM_PROMPT = _fetch_prompt()


def _sanitize_actor_id(raw: str) -> str:
    """Sanitize to match AgentCore constraint: [a-zA-Z0-9][a-zA-Z0-9-_/]*"""
    sanitized = re.sub(r"[^a-zA-Z0-9\-_/]", "_", raw)
    if not sanitized or not sanitized[0].isalnum():
        sanitized = "u" + sanitized
    return sanitized


def _extract_actor_id(context) -> str:
    """Extract user identity from the JWT that AgentCore already validated."""
    try:
        headers = getattr(context, "request_headers", None) if context else None
        logger.warning("extract_actor_id: context=%s, headers=%s", type(context).__name__ if context else None, headers)
        if not headers:
            return "anonymous"
        # Try both lowercase and mixed case header names
        auth_header = headers.get("authorization") or headers.get("Authorization") or ""
        if not auth_header:
            logger.warning("No authorization header in: %s", list(headers.keys()))
            return "anonymous"
        token = auth_header.removeprefix("Bearer ").removeprefix("bearer ")
        # Decode payload without verification — AgentCore already validated
        parts = token.split(".")
        if len(parts) < 2:
            logger.warning("JWT has fewer than 2 parts")
            return "anonymous"
        payload_b64 = parts[1]
        # Fix base64 padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        identity = claims.get("email") or claims.get("sub") or "anonymous"
        logger.warning("Extracted identity: %s", identity)
        return _sanitize_actor_id(identity) if identity != "anonymous" else identity
    except Exception as e:
        logger.warning("Failed to extract actor_id from JWT: %s", e)
        return "anonymous"


@app.entrypoint
async def invoke(payload=None, context=None):
    """Main entrypoint for the agent — streams text chunks via SSE"""
    try:
        query = (
            payload.get("prompt", payload.get("message", "Hello!"))
            if payload
            else "Hello!"
        )
        session_id = payload.get("session_id", "default") if payload else "default"
        actor_id = _extract_actor_id(context)
        logger.warning("invoke: session_id=%s, actor_id=%s", session_id, actor_id)

        if MEMORY_ID:
            config = AgentCoreMemoryConfig(
                memory_id=MEMORY_ID,
                session_id=session_id,
                actor_id=actor_id,
            )
            with AgentCoreMemorySessionManager(config, region_name=REGION) as session_manager:
                agent = Agent(
                    system_prompt=SYSTEM_PROMPT,
                    name="AgentCore Chatbot",
                    tools=[retrieve] if KNOWLEDGE_BASE_ID else [],
                    session_manager=session_manager,
                    callback_handler=None,
                )
                async for event in agent.stream_async(query):
                    if "data" in event:
                        yield event["data"]
        else:
            agent = Agent(
                system_prompt=SYSTEM_PROMPT,
                name="AgentCore Chatbot",
                tools=[retrieve] if KNOWLEDGE_BASE_ID else [],
                callback_handler=None,
            )
            async for event in agent.stream_async(query):
                if "data" in event:
                    yield event["data"]

    except Exception as e:
        logger.exception("Agent invocation failed")
        yield f"Sorry, something went wrong: {e}"


if __name__ == "__main__":
    app.run()
