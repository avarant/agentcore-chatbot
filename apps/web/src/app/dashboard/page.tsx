"use client";

import { useState, useEffect } from "react";
import { useCustomer } from "./customer-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Copy,
  Check,
  Info,
} from "lucide-react";

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
      .catch(() => {})
      .finally(() => setSnippetLoading(false));
  }, [customer?.id, mcpConfig?.runtime_arn]);

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
            mcp_url: mcpUrl || undefined,
            oidc_discovery_url: oidcUrl || undefined,
            allowed_audiences: audiences || undefined,
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

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mcpUrl">
                  MCP Server URL{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="mcpUrl"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  placeholder="https://mcp.example.com (leave blank to use Claude without tools)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oidcUrl">
                  OIDC Discovery URL{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="oidcUrl"
                  value={oidcUrl}
                  onChange={(e) => setOidcUrl(e.target.value)}
                  placeholder="https://auth.example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audiences">
                  Allowed Audiences{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="audiences"
                  value={audiences}
                  onChange={(e) => setAudiences(e.target.value)}
                  placeholder="chatbot"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
                {saved && (
                  <span className="text-sm font-medium text-green-600">
                    Configuration saved!
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Snippet */}
        <Card>
          <CardHeader>
            <CardTitle>Embed Snippet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {snippetLoading ? (
              <p className="text-sm text-muted-foreground">Loading snippet...</p>
            ) : snippet ? (
              <>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-sm text-neutral-100 font-mono leading-relaxed">
                    {snippet}
                  </pre>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    className="absolute top-3 right-3"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    Your website must expose a token endpoint
                    (e.g., <code className="text-xs font-mono bg-blue-100 px-1 py-0.5 rounded">/api/chatbot-token/</code>)
                    that converts the user&apos;s session into a JWT. See the{" "}
                    <a href="/docs" className="underline font-medium">
                      documentation
                    </a>{" "}
                    for setup instructions.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Complete the configuration and provision your chatbot to get the embed snippet.
              </p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
