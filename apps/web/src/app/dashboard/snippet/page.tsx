"use client";

import { useState } from "react";

const snippetCode = `<script
  src="https://cdn.agent77.ai/widget.js"
  data-token-url="https://api.agent77.ai/token/YOUR_CHATBOT_ID"
  data-runtime-url="wss://runtime.agent77.ai/YOUR_CHATBOT_ID"
  defer
></script>`;

export default function SnippetPage() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(snippetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Embed Snippet</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-700">
            Installation Instructions
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Add this snippet to your website&apos;s HTML, before the closing{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
              &lt;/body&gt;
            </code>{" "}
            tag.
          </p>
        </div>

        {/* Code block */}
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 font-mono leading-relaxed">
            {snippetCode}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-600 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> The{" "}
            <code className="text-xs font-mono">data-token-url</code> and{" "}
            <code className="text-xs font-mono">data-runtime-url</code>{" "}
            values shown above are placeholders. They will be replaced with your
            actual endpoints after provisioning is complete.
          </p>
        </div>
      </div>
    </div>
  );
}
