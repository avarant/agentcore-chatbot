export default function SnippetPage() {
  return (
    <article className="prose prose-gray max-w-3xl">
      <h1>JS Snippet Guide</h1>

      <h2>Installation</h2>
      <p>
        Add one script tag before the closing <code>&lt;/body&gt;</code> tag:
      </p>
      <pre><code className="language-html">{`<script
  src="https://cdn.agent77.ai/widget.js"
  data-token-url="/api/chatbot/token"
  data-runtime-url="https://runtime.agent77.ai"
></script>`}</code></pre>
      <p>That&apos;s it. The widget renders a chat button in the bottom-right corner.</p>

      <h2>Attributes</h2>
      <table>
        <thead>
          <tr>
            <th>Attribute</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>data-token-url</code></td>
            <td>Yes</td>
            <td>
              URL of your token endpoint. Can be absolute or relative to the
              current page. The widget sends a <code>POST</code> request here
              with <code>credentials: &quot;include&quot;</code> to attach
              cookies.
            </td>
          </tr>
          <tr>
            <td><code>data-runtime-url</code></td>
            <td>Yes</td>
            <td>
              The Agent77 runtime URL. Use{" "}
              <code>https://runtime.agent77.ai</code> for production.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>How Auth Works</h2>
      <ol>
        <li>
          User clicks the chat button.
        </li>
        <li>
          The widget sends <code>POST data-token-url</code> with{" "}
          <code>credentials: &quot;include&quot;</code> so your session cookie is
          attached.
        </li>
        <li>
          Your token endpoint verifies the session and returns{" "}
          <code>{`{"token": "<jwt>"}`}</code>.
        </li>
        <li>
          The widget opens a connection to <code>data-runtime-url</code>,
          passing the JWT.
        </li>
        <li>
          Agent77 validates the JWT via your OIDC discovery endpoints and
          connects to your MCP server.
        </li>
      </ol>

      <h2>Customization</h2>
      <table>
        <thead>
          <tr>
            <th>Attribute</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>data-position</code></td>
            <td><code>bottom-right</code></td>
            <td>
              Widget position: <code>bottom-right</code> or{" "}
              <code>bottom-left</code>
            </td>
          </tr>
          <tr>
            <td><code>data-theme</code></td>
            <td><code>light</code></td>
            <td>
              Color theme: <code>light</code> or <code>dark</code>
            </td>
          </tr>
          <tr>
            <td><code>data-greeting</code></td>
            <td><em>none</em></td>
            <td>
              Initial message shown when the chat opens. E.g.{" "}
              <code>data-greeting=&quot;Hi! How can I help?&quot;</code>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Troubleshooting</h2>

      <h3>CORS Errors</h3>
      <p>
        The widget makes a <code>POST</code> request to your token endpoint from
        the browser. Your server must return the correct CORS headers:
      </p>
      <pre><code className="language-http">{`Access-Control-Allow-Origin: https://yoursite.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: Content-Type`}</code></pre>
      <p>
        Do <strong>not</strong> use <code>Access-Control-Allow-Origin: *</code>{" "}
        with credentials — browsers reject it. Set the exact origin.
      </p>

      <h3>401 from Token Endpoint</h3>
      <ul>
        <li>
          <strong>Cookie not sent?</strong> The widget uses{" "}
          <code>credentials: &quot;include&quot;</code>, but cookies are only
          sent if the token endpoint is on the same domain (or a subdomain with{" "}
          <code>SameSite=None; Secure</code>).
        </li>
        <li>
          <strong>Session expired?</strong> If the user&apos;s session has
          expired, the token endpoint will return 401. The widget will show a
          &quot;Please log in&quot; message.
        </li>
      </ul>

      <h3>Widget Not Appearing</h3>
      <ul>
        <li>
          Check the browser console for script loading errors.
        </li>
        <li>
          Verify the <code>src</code> URL is correct and accessible.
        </li>
        <li>
          Make sure the script tag has both <code>data-token-url</code> and{" "}
          <code>data-runtime-url</code> attributes.
        </li>
      </ul>

      <h3>JWT Verification Fails at Runtime</h3>
      <ul>
        <li>
          Verify your <code>/.well-known/openid-configuration</code> is
          accessible from the public internet.
        </li>
        <li>
          Check that <code>issuer</code> in the config matches the{" "}
          <code>iss</code> claim in the JWT exactly (no trailing slash
          mismatch).
        </li>
        <li>
          Ensure the <code>kid</code> in the JWT header matches a key in your
          JWKS response.
        </li>
      </ul>
    </article>
  );
}
