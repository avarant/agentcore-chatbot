export type Env = {
  Bindings: {
    COGNITO_USER_POOL_ID?: string;
    COGNITO_CLIENT_ID?: string;
    COGNITO_DOMAIN?: string;
    DASHBOARD_API_KEY?: string;
    SITES_CONFIG: string;
  };
  Variables: {
    userId: string;
    email: string;
    authMode: "cognito" | "api_key";
  };
};
