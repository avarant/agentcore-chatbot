"use client";

import { createContext, useContext } from "react";

export type User = {
  sub: string;
  email: string;
};

export type Customer = {
  id: string;
  user_id: string;
  email: string;
  domain: string | null;
  status: string;
  created_at: string;
};

export type McpConfig = {
  id: string;
  customer_id: string;
  mcp_url: string;
  oidc_discovery_url: string;
  allowed_audiences: string | null;
  runtime_arn: string | null;
  auth_method: string;
  created_at: string;
};

type CustomerContextType = {
  user: User | null;
  customer: Customer | null;
  mcpConfig: McpConfig | null;
  runtimeUrl: string | null;
  reload: () => Promise<void>;
};

export const CustomerContext = createContext<CustomerContextType>({
  user: null,
  customer: null,
  mcpConfig: null,
  runtimeUrl: null,
  reload: async () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}
