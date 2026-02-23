"use client";

import Link from "next/link";
import { useCustomer } from "./customer-context";

export default function DashboardPage() {
  const { customer, mcpConfig } = useCustomer();

  const isActive = customer?.status === "active" && mcpConfig?.runtime_arn;
  const isPending = customer && !isActive;
  const needsSetup = !customer;

  const statusColor = isActive
    ? "green"
    : isPending
      ? "yellow"
      : "gray";

  const statusLabel = isActive
    ? "Active"
    : isPending
      ? "Pending Setup"
      : "Not Configured";

  const statusDescription = isActive
    ? "Your chatbot is live and accepting messages."
    : isPending
      ? "Complete the setup wizard to provision your chatbot."
      : "Get started by running the setup wizard.";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>

      {/* Status card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {isActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                statusColor === "green"
                  ? "bg-green-500"
                  : statusColor === "yellow"
                    ? "bg-yellow-500"
                    : "bg-gray-400"
              }`}
            />
          </span>
          <span className="text-lg font-semibold text-gray-900">
            {statusLabel}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-500">{statusDescription}</p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Domain</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {customer?.domain || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Active since</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {customer?.created_at
              ? new Date(customer.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </p>
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
