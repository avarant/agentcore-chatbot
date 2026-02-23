const usageData = [
  { month: "February 2026", count: 1247 },
  { month: "January 2026", count: 3891 },
  { month: "December 2025", count: 2654 },
  { month: "November 2025", count: 1823 },
  { month: "October 2025", count: 956 },
];

const planLimit = 10000;
const currentUsage = usageData[0].count;

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Usage</h1>

      {/* Plan limit indicator */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Messages this month
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {currentUsage.toLocaleString()}{" "}
              <span className="text-sm font-normal text-gray-500">
                / {planLimit.toLocaleString()}
              </span>
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            Pro Plan
          </span>
        </div>
        <div className="mt-4 h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.min((currentUsage / planLimit) * 100, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {((currentUsage / planLimit) * 100).toFixed(1)}% of monthly limit used
        </p>
      </div>

      {/* Usage table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Month
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Messages
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {usageData.map((row) => (
              <tr key={row.month} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">
                  {row.month}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
