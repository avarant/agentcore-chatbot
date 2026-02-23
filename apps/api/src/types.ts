export type Env = {
  Bindings: {
    DB: D1Database;
    CACHE: KVNamespace;
    ASSETS: R2Bucket;
    COGNITO_USER_POOL_ID: string;
    COGNITO_REGION: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_CLIENT_SECRET: string;
    COGNITO_DOMAIN: string;
    COGNITO_REDIRECT_URI: string;
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    STRIPE_WEBHOOK_SECRET: string;
    DASHBOARD_URL: string;
  };
  Variables: {
    userId: string;
    email: string;
  };
};
