"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [mcpUrl, setMcpUrl] = useState("https://mcp.example.com");
  const [oidcUrl, setOidcUrl] = useState("https://auth.example.com");
  const [domain, setDomain] = useState("example.com");
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // API stub
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleDelete() {
    // API stub
    alert("Chatbot deleted (stub)");
    setShowDeleteConfirm(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save Changes
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
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Yes, delete my chatbot
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
