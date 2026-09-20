import { execFileSync } from "node:child_process";

/**
 * Applies migrations to the test database once per run.
 *
 * Integration tests exercise database-level guarantees — unique constraints,
 * transactional rollback, cascading deletes — so they run against a real
 * PostgreSQL schema built the same way production's is.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need their own database — see .env.example.",
    );
  }

  execFileSync("node", ["./node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
