"use client";

import { useState, useEffect } from "react";
import { useCustomer } from "./customer-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function DashboardPage() {
  const { customer, mcpConfig, reload } = useCustomer();

  // Form state
  const [mcpUrl, setMcpUrl] = useState("");
  const [oidcUrl, setOidcUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [audiences, setAudiences] = useState("");

  // Snippet state
  const [snippet, setSnippet] = useState<string | null>(null);
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Populate form from customer/mcpConfig
  useEffect(() => {
    if (customer) {
      setDomain(customer.domain || "");
    }
    if (mcpConfig) {
      setMcpUrl(mcpConfig.mcp_url || "");
      setOidcUrl(mcpConfig.oidc_discovery_url || "");
      setAudiences(mcpConfig.allowed_audiences || "");
    }
  }, [customer, mcpConfig]);

  // Load snippet
  useEffect(() => {
    if (!customer?.id || !mcpConfig?.runtime_arn) return;

    setSnippetLoading(true);
    fetch(`${API_URL}/api/customers/snippet`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load snippet");
        return res.json();
      })
      .then((data) => {
        setSnippet(data.snippet);
      })
      .catch(() => {
        // snippet not available yet
      })
      .finally(() => setSnippetLoading(false));
  }, [customer?.id, mcpConfig?.runtime_arn]);

  // Status
  const isActive = customer?.status === "active" && mcpConfig?.runtime_arn;
  const isPending = customer && !isActive;
  const statusColor = isActive ? "green" : isPending ? "yellow" : "gray";
  const statusLabel = isActive
    ? "Active"
    : isPending
      ? "Pending Setup"
      : "Not Configured";
  const statusDescription = isActive
    ? "Your chatbot is live and accepting messages."
    : isPending
      ? "Complete the configuration below to finish setup."
      : "Configure your chatbot to get started.";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/customers/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          mcp_config: {
            mcp_url: mcpUrl,
            oidc_discovery_url: oidcUrl,
            allowed_audiences: audiences,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save configuration");
      }

      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/customers/me`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete chatbot");
      }

      await reload();
      setShowDeleteConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. Status */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Status</h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {isActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                statusColor === "green"
                  ? "bg-green-500"
                  : statusColor === "yellow"
                    ? "bg-yellow-500"
                    : "bg-gray-400"
              }`}
            />
          </span>
          <span className="font-semibold text-gray-900">{statusLabel}</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">{statusDescription}</p>
        {customer?.domain && (
          <p className="mt-2 text-sm text-gray-500">
            Domain: <span className="font-medium text-gray-700">{customer.domain}</span>
          </p>
        )}
      </div>

      {/* 2. Configuration */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
      >
        <h2 className="text-lg font-semibold text-gray-900">Configuration</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            MCP Server URL
          </label>
          <input
            type="url"
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            placeholder="https://mcp.example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            OIDC Discovery URL
          </label>
          <input
            type="url"
            value={oidcUrl}
            onChange={(e) => setOidcUrl(e.target.value)}
            placeholder="https://auth.example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Domain
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Allowed Audiences
          </label>
          <input
            type="text"
            value={audiences}
            onChange={(e) => setAudiences(e.target.value)}
            placeholder="chatbot"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Configuration saved!
            </span>
          )}
        </div>
      </form>

      {/* 3. Snippet */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Embed Snippet</h2>

        {snippetLoading ? (
          <p className="text-sm text-gray-500">Loading snippet...</p>
        ) : snippet ? (
          <>
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
                <a href="/docs" className="underline font-medium">
                  documentation
                </a>{" "}
                for setup instructions.
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Complete the configuration and provision your chatbot to get the embed snippet.
          </p>
        )}
      </div>

      {/* 4. Danger Zone */}
      {customer && (
        <div className="rounded-xl border-2 border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
          <p className="mt-1 text-sm text-gray-500">
            Permanently delete your chatbot and all associated data. This action
            cannot be undone.
          </p>

          {showDeleteConfirm ? (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete my chatbot"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete Chatbot
            </button>
          )}
        </div>
      )}
    </div>
  );
}
