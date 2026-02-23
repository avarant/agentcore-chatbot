export type Env = {
  Bindings: {
    DYNAMODB_TABLE: string;
    COGNITO_USER_POOL_ID: string;
    COGNITO_REGION: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_CLIENT_SECRET: string;
    COGNITO_DOMAIN: string;
    COGNITO_REDIRECT_URI: string;
    DASHBOARD_URL: string;
    AGENTCORE_RUNTIME_URL: string;
  };
  Variables: {
    userId: string;
    email: string;
  };
};
