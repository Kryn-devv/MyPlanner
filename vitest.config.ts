import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `globalSetup` runs in this process, before any setup file, so `.env` has to
// be loaded here too — not only in tests/setup.ts.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Fall through to the explicit "TEST_DATABASE_URL is not set" error.
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws if imported outside a React Server Component.
      // Tests exercise those modules directly, so it is stubbed out.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Integration tests share one PostgreSQL database; running files in
    // parallel would let them delete each other's fixtures mid-assertion.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
