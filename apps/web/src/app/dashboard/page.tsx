import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>

      {/* Status card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
          </span>
          <span className="text-lg font-semibold text-gray-900">Active</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Your chatbot is live and accepting messages.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Messages this month</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">1,247</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Active since</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">Jan 15, 2026</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/setup"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
        >
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
            Setup &rarr;
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Configure your chatbot&apos;s domain, MCP server, and authentication.
          </p>
        </Link>
        <Link
          href="/dashboard/snippet"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
        >
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
            Snippet &rarr;
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get the embed code to add the chatbot to your website.
          </p>
        </Link>
      </div>
    </div>
  );
}
