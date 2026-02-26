"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomerContext, type Customer, type User } from "./customer-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, MessageSquare, LogOut, Bot } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
const REDIRECT_URI = encodeURIComponent(process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL || "");
const LOGIN_URL = `${COGNITO_DOMAIN}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${encodeURIComponent("openid email profile")}`;

const NAV_ITEMS = [
  { href: "/dashboard", label: "Settings", icon: Settings },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquare },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignOut, setShowSignOut] = useState(false);

  const loadCustomer = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers/me`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer || null);
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
          window.location.href = LOGIN_URL;
          return null;
        }
        return res.json();
      })
      .then(async (data) => {
        if (data) {
          setUser(data.user || null);
          await loadCustomer();
        }
        setLoading(false);
      })
      .catch(() => {
        window.location.href = LOGIN_URL;
      });
  }, [loadCustomer]);

  function handleLogout() {
    window.location.href = `${API_URL}/api/auth/logout`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <CustomerContext.Provider value={{ user, customer, reload }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card">
          {/* Brand */}
          <div className="flex items-center gap-2 px-5 py-5">
            <Bot className="size-5" />
            <span className="text-lg font-bold tracking-tight">Agent77</span>
          </div>

          <Separator />

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3"
                    size="sm"
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* User section at bottom */}
          <div className="relative mt-auto border-t p-3">
            {showSignOut && (
              <div className="absolute bottom-full left-3 right-3 mb-1 rounded-md border bg-popover p-1 shadow-md">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            )}
            <button
              onClick={() => setShowSignOut((v) => !v)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors"
            >
              <span className="flex-1 truncate text-left text-sm">
                {user?.email || "Unknown"}
              </span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="ml-60 flex-1 p-6 lg:p-8">
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </CustomerContext.Provider>
  );
}
