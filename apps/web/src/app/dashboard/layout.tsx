"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomerContext, type User, type Site } from "./customer-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, MessageSquare, LogOut, BookOpen, Database, ChevronDown, Sparkles } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
const REDIRECT_URI = encodeURIComponent(process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL || "");
const LOGIN_URL = `${COGNITO_DOMAIN}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${encodeURIComponent("openid email profile")}`;
const SITE_ID_KEY = "agentcore_site_id";

const NAV_ITEMS = [
  { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/dashboard/insights", label: "Insights", icon: Sparkles },
  { href: "/dashboard/prompt", label: "Prompt", icon: BookOpen },
  { href: "/dashboard/knowledge-base", label: "Knowledge Base", icon: Database },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignOut, setShowSignOut] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteIdState] = useState<string>("");
  const [showSitePicker, setShowSitePicker] = useState(false);

  const setSiteId = useCallback((id: string) => {
    setSiteIdState(id);
    try { localStorage.setItem(SITE_ID_KEY, id); } catch { /* ignore */ }
    setShowSitePicker(false);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          window.location.href = LOGIN_URL;
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUser(data.user || null);
        }
        setLoading(false);
      })
      .catch(() => {
        window.location.href = LOGIN_URL;
      });
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/sites`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data?.sites?.length) return;
        const loaded: Site[] = data.sites;
        setSites(loaded);

        const saved = (() => { try { return localStorage.getItem(SITE_ID_KEY); } catch { return null; } })();
        const initial = loaded.find((s) => s.id === saved) ? saved! : loaded[0].id;
        setSiteIdState(initial);
      })
      .catch(() => {});
  }, []);

  function handleLogout() {
    window.location.href = `${API_URL}/api/auth/logout`;
  }

  const activeSite = sites.find((s) => s.id === siteId);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <CustomerContext.Provider value={{ user, reload, sites, siteId, setSiteId }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card">
          {/* Brand */}
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="text-xl font-bold italic tracking-tight bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">agentcore</span>
          </div>

          <Separator />

          {/* Site switcher — only shown when >1 site */}
          {sites.length > 1 && (
            <div className="relative px-3 py-2">
              <button
                onClick={() => setShowSitePicker((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="truncate font-medium">{activeSite?.name ?? siteId}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
              {showSitePicker && (
                <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
                  {sites.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSiteId(s.id)}
                      className={`flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        s.id === siteId ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
        <main className="ml-60 flex-1 flex flex-col h-screen overflow-hidden p-6 lg:p-8">
          <div className="mx-auto w-full max-w-screen-2xl flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </CustomerContext.Provider>
  );
}
