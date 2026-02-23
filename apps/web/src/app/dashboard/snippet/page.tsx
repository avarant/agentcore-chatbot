"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCustomer } from "../customer-context";

const API_URL = "https://api.agent77.app";

export default function SnippetPage() {
  const { customer, mcpConfig } = useCustomer();
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer?.id || !mcpConfig?.runtime_arn) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/customers/${customer.id}/snippet`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load snippet");
        return res.json();
      })
      .then((data) => {
        setSnippet(data.snippet);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [customer?.id, mcpConfig?.runtime_arn]);

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Embed Snippet</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!customer || !mcpConfig?.runtime_arn) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Embed Snippet</h1>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-yellow-800">
            Setup required
          </h2>
          <p className="mt-1 text-sm text-yellow-700">
            Complete the{" "}
            <Link href="/dashboard/setup" className="underline font-medium">
              Setup Wizard
            </Link>{" "}
            to provision your chatbot before getting the embed snippet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Embed Snippet</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

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
            {snippet}
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
            <strong>Note:</strong> Your website must expose a token endpoint
            (e.g., <code className="text-xs font-mono">/api/chatbot-token/</code>)
            that converts the user&apos;s session into a JWT. See the{" "}
            <Link href="/docs" className="underline font-medium">
              documentation
            </Link>{" "}
            for setup instructions.
          </p>
        </div>
      </div>
    </div>
  );
}
