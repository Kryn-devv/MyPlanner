import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    // Keeps Server Action payloads small; task forms are text-only.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
