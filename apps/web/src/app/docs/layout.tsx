import Link from "next/link";

const navItems = [
  { href: "/docs", label: "Getting Started" },
  { href: "/docs/token-endpoint", label: "Token Endpoint" },
  { href: "/docs/oidc-discovery", label: "OIDC Discovery" },
  { href: "/docs/mcp-server", label: "MCP Server" },
  { href: "/docs/snippet", label: "JS Snippet" },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-6">
        <Link href="/docs" className="text-lg font-bold text-gray-900">
          Agent77 Docs
        </Link>
        <nav className="mt-6 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-12 py-10">{children}</main>
    </div>
  );
}
