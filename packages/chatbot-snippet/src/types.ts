export interface ChatbotConfig {
  tokenUrl: string;
  runtimeUrl: string;
}

export interface TokenResponse {
  token: string;
}

export interface SendMessagePayload {
  prompt: string;
}

export interface ChatMessage {
  role: "user" | "bot";
  content: string;
}
