import os
import logging

# Ensure region is always available for boto3/SDK clients
REGION = os.environ.get("AWS_REGION_NAME") or os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
os.environ.setdefault("AWS_DEFAULT_REGION", REGION)

import boto3
from strands import Agent
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager,
)

logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant. Answer questions clearly and concisely."


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


@app.entrypoint
async def invoke(payload=None):
    """Main entrypoint for the agent"""
    try:
        query = (
            payload.get("prompt", payload.get("message", "Hello!"))
            if payload
            else "Hello!"
        )
        session_id = payload.get("session_id", "default") if payload else "default"
        actor_id = payload.get("user_id", "anonymous") if payload else "anonymous"

        if MEMORY_ID:
            config = AgentCoreMemoryConfig(
                memory_id=MEMORY_ID,
                session_id=session_id,
                actor_id=actor_id,
            )
            with AgentCoreMemorySessionManager(config, region_name=REGION) as session_manager:
                agent = Agent(
                    system_prompt=SYSTEM_PROMPT,
                    name="Agent77",
                    session_manager=session_manager,
                )
                response = agent(query)
        else:
            # Fallback: no memory configured
            agent = Agent(
                system_prompt=SYSTEM_PROMPT,
                name="Agent77",
            )
            response = agent(query)

        return {"status": "success", "response": response.message["content"][0]["text"]}

    except Exception as e:
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    app.run()
