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

type CustomerContextType = {
  user: User | null;
  customer: Customer | null;
  reload: () => Promise<void>;
};

export const CustomerContext = createContext<CustomerContextType>({
  user: null,
  customer: null,
  reload: async () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}
