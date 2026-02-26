"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  const [snippet, setSnippet] = useState<string | null>(null);
  const [snippetLoading, setSnippetLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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
  }, []);

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

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
                Runtime not configured. Set the AGENTCORE_RUNTIME_URL environment variable.
              </p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
