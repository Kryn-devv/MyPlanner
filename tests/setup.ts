/**
 * Test bootstrap.
 *
 * Integration tests run against a real PostgreSQL database — the XP and
 * authorisation guarantees this app makes are enforced by database constraints
 * and transactions, and a mocked Prisma client would test none of that.
 *
 * `TEST_DATABASE_URL` is required for those; unit tests do not touch it.
 */
import { loadEnv } from "./load-env.ts";

loadEnv();

process.env.NODE_ENV = "test";
process.env.AUTH_SECRET ??= "test-secret-at-least-thirty-two-characters-long";
process.env.NEXT_PUBLIC_APP_NAME ??= "NOVA";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
