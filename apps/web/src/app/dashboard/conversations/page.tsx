"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Session = { session_id: string; actor_id: string; created_at: string; summary: string | null };
type HistoryMessage = { role: string; content: string; timestamp: string };

// Reverse the sanitizeActorId transformation to display a readable identifier.
// AgentCore requires [a-zA-Z0-9][a-zA-Z0-9-_/]* so emails have @ and . replaced with _.
// Heuristic: if it looks like a sanitized email (contains exactly one segment before a
// known domain pattern), restore the @ and dots.
function displayActorId(actorId: string): string {
  if (!actorId || actorId === "anonymous") return "Anonymous";
  // Try to detect email pattern: name_domain_tld or name_domain_co_tld
  const match = actorId.match(/^(.+?)_([a-z0-9]+(?:_[a-z]{2,})+)$/i);
  if (match) {
    const local = match[1];
    const domainParts = match[2].split("_");
    return `${local}@${domainParts.join(".")}`;
  }
  // Fallback: just replace underscores with spaces for readability
  return actorId.replace(/_/g, " ");
}

export default function ConversationsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const fetchSessions = useCallback(async (cursor?: string) => {
    const isFirstPage = !cursor;
    if (isFirstPage) {
      setSessionsLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${API_URL}/api/conversations?${params}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const loaded: Session[] = (data.sessions || []).sort(
          (a: Session, b: Session) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setNextCursor(data.nextCursor || null);

        if (isFirstPage) {
          setSessions(loaded);
          // Auto-select first session only on initial load
          if (isInitialLoad.current && loaded.length > 0) {
            isInitialLoad.current = false;
            loadSessionMessages(loaded[0].session_id);
          }
        } else {
          setSessions((prev) => [...prev, ...loaded]);
        }
      }
    } catch {
      // ignore
    } finally {
      if (isFirstPage) {
        setSessionsLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  // Auto-load sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore && !sessionsLoading) {
          fetchSessions(nextCursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, sessionsLoading, fetchSessions]);

  function handleRefresh() {
    isInitialLoad.current = true;
    setNextCursor(null);
    setSelectedSession(null);
    setHistoryMessages([]);
    fetchSessions();
  }

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
          onClick={handleRefresh}
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
          <div className="w-72 shrink-0">
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-1 pr-3">
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
                    <div className="truncate font-medium">{displayActorId(s.actor_id)}</div>
                    {s.summary && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] opacity-80">
                        {s.summary}
                      </div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] opacity-60">
                      {new Date(s.created_at).toLocaleDateString()}{" "}
                      {new Date(s.created_at).toLocaleTimeString()}
                    </div>
                  </button>
                ))}
                {/* Sentinel for infinite scroll */}
                <div ref={sentinelRef} className="h-1" />
                {loadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </ScrollArea>
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
                          {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
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
