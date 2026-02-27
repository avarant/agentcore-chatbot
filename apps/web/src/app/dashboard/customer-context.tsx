"use client";

import { createContext, useContext } from "react";

export type User = {
  sub: string;
  email: string;
};

type CustomerContextType = {
  user: User | null;
  reload: () => Promise<void>;
};

export const CustomerContext = createContext<CustomerContextType>({
  user: null,
  reload: async () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}
