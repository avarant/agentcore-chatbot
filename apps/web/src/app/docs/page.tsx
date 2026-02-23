import Link from "next/link";

export default function DocsPage() {
  return (
    <article className="prose prose-gray max-w-3xl">
      <h1>Getting Started with Agent77</h1>
      <p>
        Agent77 lets you add an AI-powered chat agent to any website with a
        single script tag. Your agent connects to your own MCP server, uses your
        own auth, and runs in your infrastructure.
      </p>

      <h2>How It Works</h2>
      <ol>
        <li>
          A visitor loads your page. The Agent77 snippet injects a chat widget.
        </li>
        <li>
          When the user starts a conversation, the widget calls your{" "}
          <strong>token endpoint</strong> to exchange their session cookie for a
          short-lived JWT.
        </li>
        <li>
          The JWT is sent to the Agent77 runtime, which validates it via your{" "}
          <strong>OIDC discovery</strong> endpoints, then opens a session to your{" "}
          <strong>MCP server</strong>.
        </li>
        <li>
          The agent can now call tools on your MCP server on behalf of the
          authenticated user.
        </li>
      </ol>

      <h2>Quick Start (3 Steps)</h2>

      <h3>1. Configure Auth</h3>
      <p>
        Set up two things on your backend: a{" "}
        <Link href="/docs/token-endpoint">token endpoint</Link> that issues JWTs
        and{" "}
        <Link href="/docs/oidc-discovery">OIDC discovery endpoints</Link> so
        Agent77 can verify them.
      </p>

      <h3>2. Provision Your MCP Server</h3>
      <p>
        Build or adapt an{" "}
        <Link href="/docs/mcp-server">MCP-compatible server</Link> that exposes
        tools the agent can call. Agent77 forwards the user&apos;s JWT so your
        server can authorize each request.
      </p>

      <h3>3. Embed the Snippet</h3>
      <p>
        Add the{" "}
        <Link href="/docs/snippet">Agent77 script tag</Link> to your HTML. Point
        it at your token endpoint and you&apos;re live.
      </p>

      <h2>Documentation</h2>
      <ul>
        <li>
          <Link href="/docs/token-endpoint">Token Endpoint Setup</Link> —
          Issue JWTs from your backend
        </li>
        <li>
          <Link href="/docs/oidc-discovery">OIDC Discovery Setup</Link> —
          Expose public keys for JWT verification
        </li>
        <li>
          <Link href="/docs/mcp-server">MCP Server Requirements</Link> —
          Build tools the agent can call
        </li>
        <li>
          <Link href="/docs/snippet">JS Snippet Guide</Link> — Embed the
          chat widget on your site
        </li>
      </ul>
    </article>
  );
}
