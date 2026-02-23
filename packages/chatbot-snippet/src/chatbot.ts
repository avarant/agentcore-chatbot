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
      body: JSON.stringify({ prompt: message }),
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
      onChunk(text);
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
  }

  // --- Chat UI (Shadow DOM) ---
  function createChatUI(): void {
    const host = document.createElement("div");
    host.id = "chatbot-widget";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const styles = document.createElement("style");
    styles.textContent = `
      :host {
        --primary: #2563eb;
        --primary-hover: #1d4ed8;
        --bg: #ffffff;
        --bg-secondary: #f3f4f6;
        --text: #111827;
        --text-secondary: #6b7280;
        --border: #e5e7eb;
        --radius: 12px;
        --shadow: 0 8px 30px rgba(0,0,0,0.12);
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-family: var(--font);
        font-size: 14px;
        line-height: 1.5;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      .toggle-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
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
        box-shadow: var(--shadow);
        z-index: 10000;
        transition: background 0.2s, transform 0.2s;
      }
      .toggle-btn:hover { background: var(--primary-hover); transform: scale(1.05); }
      .toggle-btn svg { width: 24px; height: 24px; fill: currentColor; }

      .panel {
        position: fixed;
        bottom: 88px;
        right: 20px;
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: var(--bg);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 10000;
        border: 1px solid var(--border);
      }
      .panel.open { display: flex; }

      .header {
        padding: 16px;
        background: var(--primary);
        color: #fff;
        font-weight: 600;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .header button {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        font-size: 18px;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
      }
      .header button:hover { background: rgba(255,255,255,0.2); }

      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .messages::-webkit-scrollbar { width: 4px; }
      .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

      .msg {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        word-wrap: break-word;
        white-space: pre-wrap;
        font-size: 14px;
        line-height: 1.5;
      }
      .msg.user {
        align-self: flex-end;
        background: var(--primary);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg.bot {
        align-self: flex-start;
        background: var(--bg-secondary);
        color: var(--text);
        border-bottom-left-radius: 4px;
      }

      .input-area {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--border);
        flex-shrink: 0;
        background: var(--bg);
      }
      .input-area input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid var(--border);
        border-radius: 24px;
        outline: none;
        font-size: 14px;
        font-family: var(--font);
        background: var(--bg-secondary);
        color: var(--text);
        transition: border-color 0.2s;
      }
      .input-area input:focus { border-color: var(--primary); }
      .input-area input::placeholder { color: var(--text-secondary); }

      .input-area button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--primary);
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      .input-area button:hover { background: var(--primary-hover); }
      .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
      .input-area button svg { width: 18px; height: 18px; fill: currentColor; }
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
    header.innerHTML = `<span>Chat</span><button aria-label="Close chat">&times;</button>`;
    panel.appendChild(header);

    const messagesEl = document.createElement("div");
    messagesEl.className = "messages";
    panel.appendChild(messagesEl);

    const inputArea = document.createElement("div");
    inputArea.className = "input-area";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type a message...";

    const sendBtn = document.createElement("button");
    sendBtn.setAttribute("aria-label", "Send message");
    sendBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);
    shadow.appendChild(panel);

    // Toggle
    let open = false;
    function togglePanel() {
      open = !open;
      panel.classList.toggle("open", open);
      toggleBtn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
      if (open) input.focus();
    }

    toggleBtn.addEventListener("click", togglePanel);
    header.querySelector("button")!.addEventListener("click", togglePanel);

    // Messages
    const messages: ChatMessage[] = [];

    function addMessage(role: ChatMessage["role"], content: string): HTMLDivElement {
      const msg: ChatMessage = { role, content };
      messages.push(msg);
      const el = document.createElement("div");
      el.className = `msg ${role}`;
      el.textContent = content;
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
      sendBtn.setAttribute("disabled", "");
      input.value = "";

      addMessage("user", text);
      const botEl = addMessage("bot", "");

      try {
        const response = await sendMessage(text);
        let accumulated = "";
        await streamResponse(response, (chunk) => {
          accumulated += chunk;
          botEl.textContent = accumulated;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
        // Update stored message content
        messages[messages.length - 1].content = accumulated;
      } catch (err) {
        botEl.textContent = "Something went wrong. Please try again.";
        messages[messages.length - 1].content = botEl.textContent;
      } finally {
        sending = false;
        sendBtn.removeAttribute("disabled");
        input.focus();
      }
    }

    sendBtn.addEventListener("click", handleSend);
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
