import Link from "next/link";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "Great for trying things out.",
    badge: null,
    cta: "Get Started",
    highlight: false,
    features: [
      "1 chatbot",
      "100 messages / month",
      "Community support",
      "Basic analytics",
      "Shadow DOM widget",
    ],
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For teams shipping AI to production.",
    badge: "Coming soon",
    cta: "Join waitlist",
    highlight: true,
    features: [
      "5 chatbots",
      "Unlimited messages",
      "Priority email support",
      "Advanced analytics",
      "Custom branding",
      "JWT authentication",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations with advanced needs.",
    badge: "Coming soon",
    cta: "Contact us",
    highlight: false,
    features: [
      "Unlimited chatbots",
      "Unlimited messages",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
      "SSO / SAML",
      "On-prem deployment",
    ],
  },
];

const comparisonRows = [
  { feature: "Chatbots", free: "1", pro: "5", enterprise: "Unlimited" },
  { feature: "Messages / month", free: "100", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "MCP server connections", free: "1", pro: "5", enterprise: "Unlimited" },
  { feature: "Custom branding", free: "--", pro: "Yes", enterprise: "Yes" },
  { feature: "JWT authentication", free: "Yes", pro: "Yes", enterprise: "Yes" },
  { feature: "Streaming responses", free: "Yes", pro: "Yes", enterprise: "Yes" },
  { feature: "Shadow DOM isolation", free: "Yes", pro: "Yes", enterprise: "Yes" },
  { feature: "Analytics", free: "Basic", pro: "Advanced", enterprise: "Advanced" },
  { feature: "Support", free: "Community", pro: "Email", enterprise: "Dedicated" },
  { feature: "SLA", free: "--", pro: "--", enterprise: "Yes" },
  { feature: "SSO / SAML", free: "--", pro: "--", enterprise: "Yes" },
];

export default function PricingPage() {
  return (
    <main>
      {/* Header */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
            Pricing
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Start free and scale as you grow. No credit card required.
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 ${
                tier.highlight
                  ? "border-blue-600 shadow-lg"
                  : "border-gray-200"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 right-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  {tier.badge}
                </span>
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {tier.name}
              </h2>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-extrabold text-gray-900">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="ml-1 text-gray-500">{tier.period}</span>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">{tier.description}</p>

              <Link
                href={tier.name === "Enterprise" ? "#" : "/login"}
                className={`mt-8 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
                  tier.highlight
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {tier.cta}
              </Link>

              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Compare plans
          </h2>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-4 pr-6 font-semibold text-gray-900">
                    Feature
                  </th>
                  <th className="pb-4 pr-6 font-semibold text-gray-900">
                    Free
                  </th>
                  <th className="pb-4 pr-6 font-semibold text-gray-900">
                    Pro
                  </th>
                  <th className="pb-4 font-semibold text-gray-900">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-gray-100">
                    <td className="py-3 pr-6 font-medium text-gray-900">
                      {row.feature}
                    </td>
                    <td className="py-3 pr-6 text-gray-500">{row.free}</td>
                    <td className="py-3 pr-6 text-gray-500">{row.pro}</td>
                    <td className="py-3 text-gray-500">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
            Get started for free
          </h2>
          <p className="mt-4 text-gray-500">
            No credit card required. Set up your first chatbot in minutes.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Create your account
          </Link>
        </div>
      </section>
    </main>
  );
}
