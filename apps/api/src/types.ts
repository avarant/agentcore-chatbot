export type Env = {
  Bindings: {
    COGNITO_USER_POOL_ID?: string;
    COGNITO_CLIENT_ID?: string;
    COGNITO_DOMAIN?: string;
    DASHBOARD_API_KEY?: string;
    AGENTCORE_RUNTIME_URL: string;
    AGENTCORE_MEMORY_ID: string;
    KB_DOCS_BUCKET?: string;
    KNOWLEDGE_BASE_ID?: string;
    KB_DATA_SOURCE_ID?: string;
    PROMPT_ID?: string;
  };
  Variables: {
    userId: string;
    email: string;
    authMode: "cognito" | "api_key";
  };
};
