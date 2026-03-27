"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function Header() {
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  function handleLogout() {
    window.location.href = `${API_URL}/api/auth/logout`;
  }

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          AgentCore Chatbot
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
