/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for production builds; dev server needs rewrites
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8787/api/:path*",
      },
    ];
  },
};

export default nextConfig;
