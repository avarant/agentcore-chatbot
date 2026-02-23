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
BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-20250514"
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


async def run_agent(user_message: str, authorization_header: str) -> str:
    """
    Main agent loop:
    1. Connect to customer MCP server
    2. Discover tools
    3. Run Claude tool-use loop until final response
    """
    if not MCP_URL:
        raise ValueError("MCP_URL environment variable is not set")

    claims = extract_jwt_claims(authorization_header)
    user_id = claims.get("sub", "unknown")
    logger.info(f"Processing request for user: {user_id}")

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
                    # Extract final text response
                    text_parts = []
                    for block in output["content"]:
                        if "text" in block:
                            text_parts.append(block["text"])
                    return "\n".join(text_parts)

                if stop_reason == "tool_use":
                    tool_results = []
                    for block in output["content"]:
                        if "toolUse" in block:
                            tool_use = block["toolUse"]
                            tool_name = tool_use["name"]
                            tool_input = tool_use["input"]
                            tool_use_id = tool_use["toolUseId"]

                            logger.info(f"Calling tool: {tool_name}")
                            result_text = await call_tool(session, tool_name, tool_input)

                            tool_results.append({
                                "toolResult": {
                                    "toolUseId": tool_use_id,
                                    "content": [{"text": result_text}],
                                }
                            })

                    messages.append({"role": "user", "content": tool_results})
                else:
                    # Unexpected stop reason
                    text_parts = []
                    for block in output["content"]:
                        if "text" in block:
                            text_parts.append(block["text"])
                    return "\n".join(text_parts) if text_parts else "Agent stopped unexpectedly."

            return "Max tool rounds reached."


def handler(payload: dict, context: dict) -> dict:
    """
    AgentCore Runtime entry point.
    - payload: contains the user message
    - context: contains request headers
    """
    try:
        user_message = payload.get("message", "")
        if not user_message:
            return {"statusCode": 400, "body": json.dumps({"error": "No message provided"})}

        headers = context.get("headers", {})
        authorization = headers.get("Authorization", headers.get("authorization", ""))

        if not authorization:
            return {"statusCode": 401, "body": json.dumps({"error": "Missing Authorization header"})}

        result = asyncio.run(run_agent(user_message, authorization))

        return {"statusCode": 200, "body": json.dumps({"response": result})}

    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
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

        def log_message(self, format, *args):
            logger.info(format % args)

    server = HTTPServer(("0.0.0.0", 8000), AgentHandler)
    logger.info("Agent server listening on port 8000")
    server.serve_forever()
