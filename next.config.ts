import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * This machine's own LAN addresses, for testing the dev server from a phone.
 *
 * A phone on the same Wi-Fi loads the app from `http://<this PC's IP>:3000`,
 * so that IP becomes the page's origin. Next's dev server refuses dev-only
 * assets to any origin but `localhost` and the hostname it was started on, so
 * without this the phone gets server-rendered HTML whose scripts never load —
 * a page that looks right and ignores every tap.
 *
 * Only this machine's own addresses are added, and only in development
 * (`allowedDevOrigins` has no effect on `next start`). A site on the internet
 * cannot present itself as your LAN IP, so this does not widen what the
 * protection was guarding against. Extra hosts — a tunnel, say — can be added
 * through `DEV_ORIGINS`, comma-separated.
 */
function lanOrigins(): string[] {
  const own = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .map((net) => net!.address);

  const extra = (process.env.DEV_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return [...new Set([...own, ...extra])];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: lanOrigins(),
  experimental: {
    // Keeps Server Action payloads small; task forms are text-only.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
