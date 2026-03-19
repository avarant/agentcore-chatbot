"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useCustomer } from "../customer-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function PromptsPage() {
  const { siteId } = useCustomer();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(`${API_URL}/api/prompts?${params}`, {
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
  }, [siteId, fetchPrompt]);

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("site", siteId);
      const res = await fetch(`${API_URL}/api/prompts?${params}`, {
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
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Prompt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The system prompt defines your agent&apos;s behavior and personality.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button onClick={handleSave} disabled={saving || loading} size="sm">
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin mr-2" />
          Loading prompt...
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 w-full rounded-lg border bg-background p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none overflow-auto"
          placeholder="Enter your agent's system prompt..."
        />
      )}

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 shrink-0">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Changes take effect on the next agent container cold start.
        </p>
      </div>
    </div>
  );
}
