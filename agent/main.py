import os
import json
import logging
import asyncio

import jwt
import boto3
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MCP_URL = os.environ.get("MCP_URL", "")
BEDROCK_MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514")
MAX_TOOL_ROUNDS = 20


def extract_jwt_claims(authorization_header: str) -> dict:
    """Decode JWT claims without verifying signature (AgentCore already validated)."""
    token = authorization_header
    if token.lower().startswith("bearer "):
        token = token[7:]
    claims = jwt.decode(token, options={"verify_signature": False})
    return claims


def mcp_tool_to_anthropic(tool) -> dict:
    """Convert an MCP tool definition to Anthropic tool format."""
    return {
        "name": tool.name,
        "description": tool.description or "",
        "input_schema": tool.inputSchema if tool.inputSchema else {"type": "object", "properties": {}},
    }


async def call_tool(session: ClientSession, name: str, arguments: dict) -> str:
    """Execute a tool call via MCP and return the result as text."""
    try:
        result = await session.call_tool(name, arguments)
        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
            else:
                parts.append(str(content))
        return "\n".join(parts)
    except Exception as e:
        logger.error(f"Tool call error ({name}): {e}")
        return f"Error calling tool {name}: {e}"


async def run_agent_with_mcp(user_message: str, authorization_header: str) -> str:
    """Agent loop with MCP tools."""
    headers = {"Authorization": authorization_header}
    bedrock = boto3.client("bedrock-runtime")

    async with streamablehttp_client(MCP_URL, headers=headers) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools_result = await session.list_tools()
            anthropic_tools = [mcp_tool_to_anthropic(t) for t in tools_result.tools]
            logger.info(f"Discovered {len(anthropic_tools)} tools from MCP server")

            messages = [{"role": "user", "content": user_message}]

            for _ in range(MAX_TOOL_ROUNDS):
                response = bedrock.converse(
                    modelId=BEDROCK_MODEL_ID,
                    messages=messages,
                    toolConfig={"tools": [{"toolSpec": t} for t in anthropic_tools]} if anthropic_tools else {},
                )

                output = response["output"]["message"]
                messages.append(output)
                stop_reason = response["stopReason"]

                if stop_reason == "end_turn":
                    text_parts = [b["text"] for b in output["content"] if "text" in b]
                    return "\n".join(text_parts)

                if stop_reason == "tool_use":
                    tool_results = []
                    for block in output["content"]:
                        if "toolUse" in block:
                            tool_use = block["toolUse"]
                            logger.info(f"Calling tool: {tool_use['name']}")
                            result_text = await call_tool(session, tool_use["name"], tool_use["input"])
                            tool_results.append({
                                "toolResult": {
                                    "toolUseId": tool_use["toolUseId"],
                                    "content": [{"text": result_text}],
                                }
                            })
                    messages.append({"role": "user", "content": tool_results})
                else:
                    text_parts = [b["text"] for b in output["content"] if "text" in b]
                    return "\n".join(text_parts) if text_parts else "Agent stopped unexpectedly."

            return "Max tool rounds reached."


def run_agent_simple(user_message: str) -> str:
    """Simple agent without MCP — just Claude conversation."""
    bedrock = boto3.client("bedrock-runtime")
    response = bedrock.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": user_message}],
    )
    output = response["output"]["message"]
    text_parts = [b["text"] for b in output["content"] if "text" in b]
    return "\n".join(text_parts)


def handler(payload: dict, context: dict) -> dict:
    """AgentCore Runtime entry point."""
    try:
        user_message = payload.get("message", payload.get("prompt", ""))
        if not user_message:
            return {"statusCode": 400, "body": json.dumps({"error": "No message provided"})}

        headers = context.get("headers", {})
        authorization = headers.get("Authorization", headers.get("authorization", ""))

        if MCP_URL:
            if not authorization:
                return {"statusCode": 401, "body": json.dumps({"error": "Missing Authorization header"})}
            result = asyncio.run(run_agent_with_mcp(user_message, authorization))
        else:
            result = run_agent_simple(user_message)

        return {"statusCode": 200, "body": json.dumps({"response": result})}

    except Exception as e:
        logger.error(f"Agent error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": f"Internal agent error: {e}"})}


if __name__ == "__main__":
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class AgentHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body) if body else {}
            context = {"headers": dict(self.headers)}
            result = handler(payload, context)
            self.send_response(result["statusCode"])
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(result["body"].encode())

    server = HTTPServer(("0.0.0.0", 8000), AgentHandler)
    logger.info("Agent server listening on port 8000")
    server.serve_forever()
