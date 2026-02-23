"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { CustomerContext, type Customer, type McpConfig } from "./customer-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers/me`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer || null);
        setMcpConfig(data.mcp_config || null);
      }
    } catch {
      // ignore — customer may not exist yet
    }
  }, []);

  const reload = useCallback(async () => {
    await loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then(async (data) => {
        if (data?.user) {
          setUser(data.user);
        }
        await loadCustomer();
        setLoading(false);
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <CustomerContext.Provider value={{ customer, mcpConfig, reload }}>
      <div className="min-h-screen bg-gray-50">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <Link href="/" className="text-lg font-bold text-blue-600">
            Agent77
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Log out
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-4xl p-6 lg:p-8">{children}</main>
      </div>
    </CustomerContext.Provider>
  );
}
