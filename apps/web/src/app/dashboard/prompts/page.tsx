"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, Save, CheckCircle2, AlertCircle, Info } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function PromptsPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/prompts`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setText(data.text || "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`${API_URL}/api/prompts`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Prompts</h1>

      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            The system prompt defines your agent&apos;s behavior and personality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading prompt...
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full min-h-[300px] rounded-lg border bg-background p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                placeholder="Enter your agent's system prompt..."
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status === "saved" && (
                    <span className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 className="size-3.5" />
                      Saved
                    </span>
                  )}
                  {status === "error" && (
                    <span className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="size-3.5" />
                      Failed to save
                    </span>
                  )}
                </div>
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Changes to the system prompt take effect on the next agent container cold start.
          Existing active sessions will continue using the previous prompt until they restart.
        </p>
      </div>
    </div>
  );
}
