"use client";

import { useState } from "react";
import Link from "next/link";
import { useCustomer } from "../customer-context";

const API_URL = "https://api.agent77.app";

const steps = [
  { number: 1, label: "Domain" },
  { number: 2, label: "MCP Server" },
  { number: 3, label: "OIDC" },
  { number: 4, label: "Audiences" },
];

export default function SetupPage() {
  const { customer, mcpConfig, reload } = useCustomer();
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [oidcUrl, setOidcUrl] = useState("");
  const [audiences, setAudiences] = useState("chatbot");
  const [provisioning, setProvisioning] = useState(false);
  const [provisioned, setProvisioned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already provisioned, show that state
  const alreadyProvisioned = mcpConfig?.runtime_arn != null;

  async function handleProvision() {
    setProvisioning(true);
    setError(null);

    try {
      let customerId = customer?.id;

      // Step 1: Create customer if doesn't exist
      if (!customerId) {
        const res = await fetch(`${API_URL}/api/customers`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });
        if (!res.ok) {
          throw new Error("Failed to create customer");
        }
        const data = await res.json();
        customerId = data.customer.id;
      }

      // Step 2: Save MCP config via PUT
      const putRes = await fetch(`${API_URL}/api/customers/${customerId}`, {
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
      if (!putRes.ok) {
        throw new Error("Failed to save configuration");
      }

      // Step 3: Provision AgentCore runtime
      const provRes = await fetch(
        `${API_URL}/api/customers/${customerId}/provision`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!provRes.ok) {
        const errData = await provRes.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error || "Provisioning failed"
        );
      }

      setProvisioned(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setProvisioning(false);
    }
  }

  if (alreadyProvisioned) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Setup Wizard</h1>
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <h2 className="text-lg font-semibold text-green-800">
              Chatbot is provisioned
            </h2>
          </div>
          <p className="mt-2 text-sm text-green-700">
            Your chatbot is set up and ready. Go to{" "}
            <Link href="/dashboard/snippet" className="underline font-medium">
              Snippet
            </Link>{" "}
            to get the embed code, or{" "}
            <Link href="/dashboard/settings" className="underline font-medium">
              Settings
            </Link>{" "}
            to update your configuration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Setup Wizard</h1>
        <Link
          href="/docs"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Need help? Read the docs &rarr;
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {steps.map((s) => (
          <button
            key={s.number}
            onClick={() => setStep(s.number)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              step === s.number
                ? "bg-blue-600 text-white"
                : s.number < step
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            <span>{s.number}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Website Domain
              </label>
              <p className="mt-1 text-sm text-gray-500">
                The domain where your chatbot will be embedded (e.g., example.com).
              </p>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!domain}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                MCP Server URL
              </label>
              <p className="mt-1 text-sm text-gray-500">
                The URL of your MCP (Model Context Protocol) server that provides tools to the chatbot.
              </p>
              <input
                type="url"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://mcp.example.com"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!mcpUrl}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                OIDC Discovery URL
              </label>
              <p className="mt-1 text-sm text-gray-500">
                The base URL for your OIDC identity provider. Agent77 will use
                the following well-known endpoints:
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-gray-500 space-y-1">
                <li>
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                    /.well-known/openid-configuration
                  </code>{" "}
                  &mdash; Provider metadata (issuer, token endpoint, JWKS URI)
                </li>
                <li>
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                    /.well-known/jwks.json
                  </code>{" "}
                  &mdash; JSON Web Key Set for token verification
                </li>
              </ul>
              <input
                type="url"
                value={oidcUrl}
                onChange={(e) => setOidcUrl(e.target.value)}
                placeholder="https://auth.example.com"
                className="mt-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!oidcUrl}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Allowed Audiences
              </label>
              <p className="mt-1 text-sm text-gray-500">
                Comma-separated list of audiences that are allowed in the JWT
                token. The default &ldquo;chatbot&rdquo; audience is
                recommended.
              </p>
              <input
                type="text"
                value={audiences}
                onChange={(e) => setAudiences(e.target.value)}
                placeholder="chatbot"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>

              {provisioned ? (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm font-medium text-green-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Chatbot provisioned successfully!
                </div>
              ) : (
                <button
                  onClick={handleProvision}
                  disabled={provisioning || !audiences}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {provisioning ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Provisioning...
                    </span>
                  ) : (
                    "Provision Chatbot"
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
