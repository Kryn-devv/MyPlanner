import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moves connection configuration out of the schema file.
 *
 * The CLI (`migrate`, `studio`, `db seed`) reads the URL from here; the runtime
 * client builds its own pooled connection through the pg driver adapter in
 * `src/lib/prisma.ts`. One environment variable feeds both.
 *
 * `.env` is loaded here rather than via a flag on every npm script, so a bare
 * `npx prisma migrate dev` works the same way `npm run db:migrate` does.
 * Node has loaded env files natively since 21.7, so this needs no dependency.
 */
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath) && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Fall through to Prisma's own "cannot resolve DATABASE_URL" error, which
    // is clearer than anything we could report from here.
  }
}

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
