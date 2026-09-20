import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv } from "./tests/load-env.ts";

// `globalSetup` runs in this process, before any setup file, so .env has to be
// loaded here too — not just in tests/setup.ts.
loadEnv();

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
