"use client";

import { useState, useEffect } from "react";
import { useCustomer } from "../customer-context";

const API_URL = "https://api.agent77.app";

export default function SettingsPage() {
  const { customer, mcpConfig, reload } = useCustomer();
  const [domain, setDomain] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [oidcUrl, setOidcUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (customer) {
      setDomain(customer.domain || "");
    }
    if (mcpConfig) {
      setMcpUrl(mcpConfig.mcp_url || "");
      setOidcUrl(mcpConfig.oidc_discovery_url || "");
    }
  }, [customer, mcpConfig]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/customers/${customer.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          mcp_config: {
            mcp_url: mcpUrl,
            oidc_discovery_url: oidcUrl,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
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
    if (!customer) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/customers/${customer.id}`, {
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

  if (!customer) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">
            No chatbot configured yet. Complete the setup wizard first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Settings form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Website Domain
          </label>
          <p className="mt-1 text-sm text-gray-500">
            The domain where your chatbot is embedded.
          </p>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            MCP Server URL
          </label>
          <p className="mt-1 text-sm text-gray-500">
            The URL of your MCP server providing tools to the chatbot.
          </p>
          <input
            type="url"
            value={mcpUrl}
            onChange={(e) => setMcpUrl(e.target.value)}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            OIDC Discovery URL
          </label>
          <p className="mt-1 text-sm text-gray-500">
            The base URL for your OIDC identity provider.
          </p>
          <input
            type="url"
            value={oidcUrl}
            onChange={(e) => setOidcUrl(e.target.value)}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Settings saved!
            </span>
          )}
        </div>
      </form>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
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
    </div>
  );
}
