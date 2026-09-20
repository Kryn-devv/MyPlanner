import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Per-test-file bootstrap (runs in each worker process).
 *
 * Integration tests run against a real PostgreSQL database — the XP and
 * authorisation guarantees this app makes are enforced by database constraints
 * and transactions, and a mocked Prisma client would test none of that.
 */

// Node has loaded `.env` natively since 21.7, so no dotenv dependency.
// Values already in the environment win, keeping `DATABASE_URL=… npm test`
// working as an override.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // A malformed .env should surface as a missing-variable error with a
    // useful message, not as a parse crash here.
  }
}

// NODE_ENV is set to "test" by Vitest itself, and is typed read-only here, so
// it is deliberately not reassigned.
process.env["AUTH_SECRET"] ??= "test-secret-at-least-thirty-two-characters-long";
process.env["NEXT_PUBLIC_APP_NAME"] ??= "NOVA";

// Point every database client at the throwaway test database.
if (process.env["TEST_DATABASE_URL"]) {
  process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
}
