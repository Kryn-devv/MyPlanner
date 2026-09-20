import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moves connection configuration out of the schema file.
 *
 * The CLI (`migrate`, `studio`, `db seed`) reads the URL from here; the
 * runtime client builds its own pooled connection through the pg driver
 * adapter in `src/lib/prisma.ts`. One environment variable feeds both.
 *
 * `env()` is resolved lazily, which is what lets the integration suite point
 * the CLI at `TEST_DATABASE_URL` before invoking it.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
