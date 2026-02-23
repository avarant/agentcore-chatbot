"use client";

import { createContext, useContext } from "react";

export type Customer = {
  id: string;
  user_id: string;
  email: string;
  domain: string | null;
  plan: string;
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
  customer: Customer | null;
  mcpConfig: McpConfig | null;
  reload: () => Promise<void>;
};

export const CustomerContext = createContext<CustomerContextType>({
  customer: null,
  mcpConfig: null,
  reload: async () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}
