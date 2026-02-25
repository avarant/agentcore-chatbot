"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCustomer } from "./customer-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const TOKEN_URL = `${API_URL}/api/auth/token`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function DashboardPage() {
  const { customer, mcpConfig, runtimeUrl, reload } = useCustomer();

  // Form state
  const [mcpUrl, setMcpUrl] = useState("");
  const [oidcUrl, setOidcUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [audiences, setAudiences] = useState("");

  // Snippet state
  const [snippet, setSnippet] = useState<string | null>(null);
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chat widget state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const jwtRef = useRef<string | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  // Conversation history state
  type Session = { session_id: string; created_at: string };
  type HistoryMessage = { role: string; content: string; timestamp: string };
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      .catch(() => {
        // snippet not available yet
      })
      .finally(() => setSnippetLoading(false));
  }, [customer?.id, mcpConfig?.runtime_arn]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/conversations`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
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

  const getToken = useCallback(async (): Promise<string> => {
    const res = await fetch(TOKEN_URL, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to get token");
    const data = await res.json();
    jwtRef.current = data.token;
    return data.token;
  }, []);

  async function handleChatSend(e: React.FormEvent) {
    e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || chatLoading || !runtimeUrl) return;

    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setChatLoading(true);

    try {
      if (!jwtRef.current) await getToken();

      let res = await fetch(runtimeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtRef.current}`,
          "Content-Type": "application/json",
          "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionIdRef.current,
        },
        body: JSON.stringify({ prompt, session_id: sessionIdRef.current, user_id: customer?.email?.replace(/[^a-zA-Z0-9\-_/]/g, "_") || "anonymous" }),
      });

      // Retry once on 401 (token expired)
      if (res.status === 401) {
        await getToken();
        res = await fetch(runtimeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwtRef.current}`,
            "Content-Type": "application/json",
            "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionIdRef.current,
          },
          body: JSON.stringify({ prompt, session_id: sessionIdRef.current, user_id: customer?.email?.replace(/[^a-zA-Z0-9\-_/]/g, "_") || "anonymous" }),
        });
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: Request failed (${res.status})` },
        ]);
        return;
      }

      // Stream response, then parse
      const body = res.body;
      let accumulated = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (body) {
        const reader = body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: accumulated };
            return updated;
          });
        }
      } else {
        accumulated = await res.text();
      }

      // Parse JSON response if needed (AgentCore returns {response: "..."})
      let finalText = accumulated;
      try {
        const parsed = JSON.parse(accumulated);
        finalText = parsed.response || parsed.body || accumulated;
      } catch {
        // not JSON, use raw text
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: finalText || "No response" };
        return updated;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to connect to the server" },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Configuration */}
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
        >
          <h2 className="text-lg font-semibold text-gray-900">Configuration</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              MCP Server URL <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
              placeholder="https://mcp.example.com (leave blank to use Claude without tools)"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              OIDC Discovery URL <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={oidcUrl}
              onChange={(e) => setOidcUrl(e.target.value)}
              placeholder="https://auth.example.com"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Allowed Audiences <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={audiences}
              onChange={(e) => setAudiences(e.target.value)}
              placeholder="chatbot"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">
                Configuration saved!
              </span>
            )}
          </div>
        </form>

        {/* 3. Snippet */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Embed Snippet</h2>

          {snippetLoading ? (
            <p className="text-sm text-gray-500">Loading snippet...</p>
          ) : snippet ? (
            <>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 font-mono leading-relaxed">
                  {snippet}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-600 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Your website must expose a token endpoint
                  (e.g., <code className="text-xs font-mono">/api/chatbot-token/</code>)
                  that converts the user&apos;s session into a JWT. See the{" "}
                  <a href="/docs" className="underline font-medium">
                    documentation
                  </a>{" "}
                  for setup instructions.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Complete the configuration and provision your chatbot to get the embed snippet.
            </p>
          )}
        </div>

        {/* Conversation History */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Conversation History</h2>
            <button
              onClick={loadSessions}
              disabled={sessionsLoading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {sessionsLoading ? "Loading..." : "Load Sessions"}
            </button>
          </div>

          {sessions.length > 0 ? (
            <div className="space-y-3">
              {/* Session list */}
              <div className="flex flex-wrap gap-2">
                {sessions.map((s) => (
                  <button
                    key={s.session_id}
                    onClick={() => loadSessionMessages(s.session_id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors ${
                      selectedSession === s.session_id
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {new Date(s.created_at).toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Messages for selected session */}
              {selectedSession && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 max-h-80 overflow-y-auto">
                  {historyLoading ? (
                    <p className="text-sm text-gray-500">Loading messages...</p>
                  ) : historyMessages.length > 0 ? (
                    historyMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-900 border border-gray-200"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No messages found.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {sessionsLoading ? "Loading..." : "Click \"Load Sessions\" to view past conversations."}
            </p>
          )}
        </div>

      </div>

      {/* Floating Chat Widget Button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Toggle chatbot"
      >
        {chatOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Floating Chat Window */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex w-96 flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden" style={{ height: "480px" }}>
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-blue-600 px-4 py-3">
            <span className="text-sm font-semibold text-white">Agent77 Chatbot</span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-white/80 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-gray-400 mt-16">
                Send a message to start chatting
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleChatSend}
            className="border-t border-gray-200 px-4 py-3 flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              disabled={chatLoading}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
