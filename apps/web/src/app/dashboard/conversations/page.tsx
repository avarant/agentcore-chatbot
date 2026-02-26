"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Session = { session_id: string; created_at: string };
type HistoryMessage = { role: string; content: string; timestamp: string };

export default function ConversationsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/conversations`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const loaded: Session[] = data.sessions || [];
        setSessions(loaded);
        // Auto-select the most recent session
        if (loaded.length > 0) {
          loadSessionMessages(loaded[0].session_id);
        }
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }

  // Auto-load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessionMessages(sessionId: string) {
    setSelectedSession(sessionId);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/conversations/${sessionId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSessions}
          disabled={sessionsLoading}
        >
          <RefreshCw className={`size-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {sessionsLoading && sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No conversations yet. Start chatting to see your history here.
        </p>
      ) : (
        <div className="flex gap-6">
          {/* Session list */}
          <div className="w-56 shrink-0 space-y-1">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => loadSessionMessages(s.session_id)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  selectedSession === s.session_id
                    ? "bg-secondary text-secondary-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <div className="font-mono">{new Date(s.created_at).toLocaleDateString()}</div>
                <div className="font-mono text-[10px] opacity-60">
                  {new Date(s.created_at).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 min-w-0">
            {selectedSession ? (
              <ScrollArea className="h-[calc(100vh-12rem)] rounded-lg border bg-muted/30 p-4">
                <div className="space-y-3">
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground">Loading messages...</p>
                  ) : historyMessages.length > 0 ? (
                    historyMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border text-card-foreground"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No messages found.</p>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">Select a session to view messages</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
