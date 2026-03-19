"use client";

import { createContext, useContext } from "react";

export type User = {
  sub: string;
  email: string;
};

export type Site = {
  id: string;
  name: string;
  hasKnowledgeBase: boolean;
};

type CustomerContextType = {
  user: User | null;
  reload: () => Promise<void>;
  sites: Site[];
  siteId: string;
  setSiteId: (id: string) => void;
};

export const CustomerContext = createContext<CustomerContextType>({
  user: null,
  reload: async () => {},
  sites: [],
  siteId: "",
  setSiteId: () => {},
});

export function useCustomer() {
  return useContext(CustomerContext);
}
