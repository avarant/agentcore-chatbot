export type Env = {
  Bindings: {
    COGNITO_USER_POOL_ID?: string;
    COGNITO_CLIENT_ID?: string;
    COGNITO_DOMAIN?: string;
    DASHBOARD_URL?: string;
    DASHBOARD_API_KEY?: string;
    AGENTCORE_RUNTIME_URL: string;
    AGENTCORE_MEMORY_ID: string;
  };
  Variables: {
    userId: string;
    email: string;
    authMode: "cognito" | "api_key";
  };
};
