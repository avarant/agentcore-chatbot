import type { ChatbotConfig, ChatMessage } from "./types";

(function () {
  // --- Config from script tag data attributes ---
  function getConfig(): ChatbotConfig {
    const script =
      document.currentScript as HTMLScriptElement | null ??
      document.querySelector<HTMLScriptElement>("script[data-token-url]");
    if (!script) throw new Error("Chatbot script tag not found");
    const tokenUrl = script.dataset.tokenUrl;
    const runtimeUrl = script.dataset.runtimeUrl;
    if (!tokenUrl || !runtimeUrl) {
      throw new Error("data-token-url and data-runtime-url are required");
    }
    return { tokenUrl, runtimeUrl };
  }

  const config = getConfig();

  // --- Auth state ---
  let jwt: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const sessionId = crypto.randomUUID();

  // --- Token management ---
  async function getToken(): Promise<string> {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    const data = await res.json();
    jwt = data.token;
    scheduleRefresh();
    return jwt!;
  }

  function decodeJwtExp(token: string): number | null {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return typeof payload.exp === "number" ? payload.exp : null;
    } catch {
      return null;
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!jwt) return;
    const exp = decodeJwtExp(jwt);
    if (!exp) return;
    const msUntilExpiry = exp * 1000 - Date.now();
    const refreshIn = Math.max(msUntilExpiry - 60_000, 0);
    refreshTimer = setTimeout(() => {
      getToken().catch(console.error);
    }, refreshIn);
  }

  // --- API calls ---
  async function sendMessage(
    message: string,
    retried = false
  ): Promise<Response> {
    if (!jwt) await getToken();

    const res = await fetch(config.runtimeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
      },
      body: JSON.stringify({ prompt: message, session_id: sessionId }),
    });

    if (res.status === 401 && !retried) {
      jwt = null;
      await getToken();
      return sendMessage(message, true);
    }

    if (!res.ok) throw new Error(`Runtime request failed: ${res.status}`);
    return res;
  }

  async function streamResponse(
    response: Response,
    onChunk: (text: string) => void
  ): Promise<void> {
    const body = response.body;
    if (!body) {
      const text = await response.text();
      // Handle legacy JSON response
      try {
        const parsed = JSON.parse(text);
        onChunk(parsed.response || parsed.body || text);
      } catch {
        onChunk(text);
      }
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const raw = trimmed.slice(6);
          // SSE data may be a JSON-encoded string — unwrap quotes and escapes
          try {
            const parsed = JSON.parse(raw);
            onChunk(typeof parsed === "string" ? parsed : (parsed.response || parsed.body || raw));
          } catch {
            onChunk(raw);
          }
        } else if (trimmed && !trimmed.startsWith(":")) {
          try {
            const parsed = JSON.parse(trimmed);
            onChunk(typeof parsed === "string" ? parsed : (parsed.response || parsed.body || trimmed));
          } catch {
            onChunk(trimmed);
          }
        }
      }
    }
    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const raw = trimmed.slice(6);
        try {
          const parsed = JSON.parse(raw);
          onChunk(typeof parsed === "string" ? parsed : (parsed.response || parsed.body || raw));
        } catch {
          onChunk(raw);
        }
      } else {
        try {
          const parsed = JSON.parse(trimmed);
          onChunk(typeof parsed === "string" ? parsed : (parsed.response || parsed.body || trimmed));
        } catch {
          onChunk(trimmed);
        }
      }
    }
  }

  // --- Chat UI (Shadow DOM) ---
  function createChatUI(): void {
    const host = document.createElement("div");
    host.id = "chatbot-widget";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    // --- Simple markdown renderer ---
    function renderMarkdown(text: string): string {
      return text
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Unordered lists
        .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Ordered lists
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        // Headings
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        // Line breaks
        .replace(/\n/g, '<br>');
    }

    const styles = document.createElement("style");
    styles.textContent = `
      :host {
        --primary: #603C99;
        --primary-hover: #4e3080;
        --primary-light: #7c5bb0;
        --bg: #ffffff;
        --bg-secondary: #f0edf5;
        --bg-bot: #f7f5fa;
        --text: #1a1a2e;
        --text-secondary: #71717a;
        --border: #e8e5ed;
        --radius: 24px;
        --shadow: 0 12px 48px rgba(96,60,153,0.18), 0 4px 12px rgba(0,0,0,0.08);
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-family: var(--font);
        font-size: 14px;
        line-height: 1.6;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      .toggle-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--primary);
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(96,60,153,0.35);
        z-index: 10000;
        transition: background 0.2s, transform 0.2s, opacity 0.25s ease;
      }
      .toggle-btn:hover { background: var(--primary-hover); transform: scale(1.08); }
      .toggle-btn.hidden { opacity: 0; pointer-events: none; transform: scale(0.8); }
      .toggle-btn svg { width: 22px; height: 22px; fill: currentColor; }

      .panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 400px;
        max-width: calc(100vw - 48px);
        height: 580px;
        max-height: calc(100vh - 48px);
        background: var(--bg);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 10000;
        animation: panelSlideIn 0.3s ease;
      }
      .panel.open { display: flex; }

      @keyframes panelSlideIn {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .header {
        padding: 14px 12px;
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
        color: #fff;
        font-weight: 600;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        border-radius: var(--radius) var(--radius) 0 0;
      }
      .header-title {
        flex: 1;
        text-align: center;
        letter-spacing: 0.02em;
      }
      .header-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .header-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .header-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--bg);
      }
      .messages::-webkit-scrollbar { width: 4px; }
      .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

      .msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 16px;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.6;
      }
      .msg.user {
        align-self: flex-end;
        background: var(--bg-secondary);
        color: var(--text);
        border-bottom-right-radius: 4px;
        white-space: pre-wrap;
      }
      .msg.bot {
        align-self: flex-start;
        background: var(--bg-bot);
        color: var(--text);
        border: 1px solid var(--border);
        border-bottom-left-radius: 4px;
      }
      .msg.bot strong { font-weight: 600; }
      .msg.bot em { font-style: italic; }
      .msg.bot code {
        background: var(--bg-secondary);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 13px;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      }
      .msg.bot pre {
        background: #1e1e2e;
        color: #cdd6f4;
        padding: 10px 12px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 6px 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .msg.bot pre code {
        background: none;
        padding: 0;
        color: inherit;
        font-size: inherit;
      }
      .msg.bot ul, .msg.bot ol {
        padding-left: 18px;
        margin: 4px 0;
      }
      .msg.bot li { margin: 2px 0; }
      .msg.bot h2, .msg.bot h3, .msg.bot h4 {
        font-weight: 600;
        margin: 8px 0 4px;
      }
      .msg.bot h2 { font-size: 16px; }
      .msg.bot h3 { font-size: 15px; }
      .msg.bot h4 { font-size: 14px; }

      /* Loading dots */
      .loading-dots {
        display: inline-flex;
        gap: 4px;
        padding: 4px 0;
      }
      .loading-dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--primary);
        opacity: 0.4;
        animation: dotPulse 1.2s ease-in-out infinite;
      }
      .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
      .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dotPulse {
        0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1); }
      }

      .input-area {
        padding: 12px 16px 18px;
        flex-shrink: 0;
        background: var(--bg);
      }
      .input-area input {
        width: 100%;
        padding: 12px 20px;
        border: 1.5px solid var(--border);
        border-radius: 999px;
        outline: none;
        font-size: 14px;
        font-family: var(--font);
        background: var(--bg-secondary);
        color: var(--text);
        transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      }
      .input-area input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(96,60,153,0.1); background: var(--bg); }
      .input-area input::placeholder { color: var(--text-secondary); }
    `;
    shadow.appendChild(styles);

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.setAttribute("aria-label", "Open chat");
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
    shadow.appendChild(toggleBtn);

    // Chat panel
    const panel = document.createElement("div");
    panel.className = "panel";

    const header = document.createElement("div");
    header.className = "header";
    header.innerHTML = `<button class="header-btn" aria-label="Reset conversation"><svg viewBox="0 0 24 24"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button><span class="header-title">AI Assistant</span><button class="header-btn" aria-label="Close chat"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`;
    panel.appendChild(header);

    const messagesEl = document.createElement("div");
    messagesEl.className = "messages";
    panel.appendChild(messagesEl);

    const inputArea = document.createElement("div");
    inputArea.className = "input-area";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask a question";

    inputArea.appendChild(input);
    panel.appendChild(inputArea);
    shadow.appendChild(panel);

    // Toggle
    let open = false;
    function togglePanel() {
      open = !open;
      panel.classList.toggle("open", open);
      toggleBtn.classList.toggle("hidden", open);
      toggleBtn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
      if (open) input.focus();
    }

    toggleBtn.addEventListener("click", togglePanel);
    const headerBtns = header.querySelectorAll(".header-btn");
    // First button: reset conversation
    headerBtns[0].addEventListener("click", () => {
      messages.length = 0;
      messagesEl.innerHTML = "";
    });
    // Second button: close panel
    headerBtns[1].addEventListener("click", togglePanel);

    // Messages
    const messages: ChatMessage[] = [];

    function addMessage(role: ChatMessage["role"], content: string): HTMLDivElement {
      const msg: ChatMessage = { role, content };
      messages.push(msg);
      const el = document.createElement("div");
      el.className = `msg ${role}`;
      if (role === "bot" && content) {
        el.innerHTML = renderMarkdown(content);
      } else {
        el.textContent = content;
      }
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function showLoading(): HTMLDivElement {
      const el = document.createElement("div");
      el.className = "msg bot";
      el.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    // Send handler
    let sending = false;

    async function handleSend() {
      const text = input.value.trim();
      if (!text || sending) return;

      sending = true;
      input.value = "";

      addMessage("user", text);
      const loadingEl = showLoading();

      try {
        const response = await sendMessage(text);
        // Replace loading with actual bot message
        loadingEl.innerHTML = "";
        loadingEl.textContent = "";
        messages.push({ role: "bot", content: "" });

        let accumulated = "";
        await streamResponse(response, (chunk) => {
          accumulated += chunk;
          loadingEl.innerHTML = renderMarkdown(accumulated);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
        messages[messages.length - 1].content = accumulated;
      } catch (err) {
        loadingEl.innerHTML = "";
        loadingEl.textContent = "Something went wrong. Please try again.";
        if (messages.length && messages[messages.length - 1].role === "bot") {
          messages[messages.length - 1].content = loadingEl.textContent;
        }
      } finally {
        sending = false;
        input.focus();
      }
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // --- Init ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createChatUI);
  } else {
    createChatUI();
  }
})();
