"use client";

import { useState } from "react";
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

const RUNTIME_URL = process.env.NEXT_PUBLIC_RUNTIME_URL || "";
const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL || "";

export default function DashboardPage() {
  const [copied, setCopied] = useState(false);

  const snippet = RUNTIME_URL && WIDGET_URL
    ? `<!-- Agent77 Chat Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${WIDGET_URL}';
  s.setAttribute('data-runtime-url', '${RUNTIME_URL}');
  s.setAttribute('data-token-url', 'YOUR_TOKEN_ENDPOINT');
  s.async = true;
  document.head.appendChild(s);
})();
</script>`
    : null;

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
            {snippet ? (
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
                    Replace <code className="text-xs font-mono bg-blue-100 px-1 py-0.5 rounded">YOUR_TOKEN_ENDPOINT</code> with
                    your site&apos;s token endpoint that converts the user&apos;s session into a JWT. See the{" "}
                    <a href="/docs" className="underline font-medium">
                      documentation
                    </a>{" "}
                    for setup instructions.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Runtime not configured. Set the NEXT_PUBLIC_RUNTIME_URL environment variable.
              </p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
