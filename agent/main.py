from strands import Agent
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()


def create_agent() -> Agent:
    """Create the agent"""
    return Agent(
        system_prompt="You are a helpful assistant. Answer questions clearly and concisely.",
        name="Agent77",
    )


@app.entrypoint
async def invoke(payload=None):
    """Main entrypoint for the agent"""
    try:
        query = (
            payload.get("prompt", payload.get("message", "Hello!"))
            if payload
            else "Hello!"
        )

        agent = create_agent()
        response = agent(query)

        return {"status": "success", "response": response.message["content"][0]["text"]}

    except Exception as e:
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    app.run()
