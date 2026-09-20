import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.env` into `process.env` without adding a dotenv dependency —
 * Node ships this since 21.7.
 *
 * Called from both the Vitest config (for `globalSetup`, which runs in the
 * main process) and the per-file setup (which runs in worker processes).
 * Existing values win, so `DATABASE_URL=... npm test` still overrides the file.
 */
export function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    // A malformed .env should surface as a missing-variable error with a
    // useful message, not as a parse crash here.
  }
}
