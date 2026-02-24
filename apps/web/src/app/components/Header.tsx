"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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
    document.cookie = "token=; path=/; max-age=0";
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
          Agent77
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Features
          </Link>
          <a href="https://github.com/avarant/agent77" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            GitHub
          </a>
          <Link href="/docs" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <a
                href="/login.html"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Log in
              </a>
              <a
                href="/login.html"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Sign up
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
