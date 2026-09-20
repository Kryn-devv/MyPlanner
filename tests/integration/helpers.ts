import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "@/config/categories";
import { hashPassword } from "@/lib/auth/password";

/**
 * Test fixtures.
 *
 * Uses its own client rather than the app singleton so that a test can assert
 * on rows independently of whatever connection the code under test used.
 */
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

/** Deleting users cascades to tasks, categories, ledger rows and stats. */
export async function resetDatabase(): Promise<void> {
  await db.user.deleteMany({});
}

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  timezone: string;
  categoryIds: string[];
}

export async function createTestUser(options: { timezone?: string } = {}): Promise<TestUser> {
  counter += 1;
  const email = `user${counter}.${Date.now()}@example.test`;
  const timezone = options.timezone ?? "UTC";

  const user = await db.user.create({
    data: {
      email,
      name: `Test User ${counter}`,
      timezone,
      passwordHash: await hashPassword("correct-horse-battery"),
      stats: { create: {} },
      categories: {
        create: DEFAULT_CATEGORIES.map((c) => ({ name: c.name, color: c.color })),
      },
    },
    select: { id: true, categories: { select: { id: true } } },
  });

  return { id: user.id, email, timezone, categoryIds: user.categories.map((c) => c.id) };
}

export async function createTestTask(
  userId: string,
  overrides: Partial<{
    title: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    xpReward: number;
    dueDate: Date | null;
    categoryId: string | null;
  }> = {},
) {
  return db.task.create({
    data: {
      userId,
      title: overrides.title ?? "Test task",
      priority: overrides.priority ?? "MEDIUM",
      xpReward: overrides.xpReward ?? 20,
      dueDate: overrides.dueDate ?? null,
      categoryId: overrides.categoryId ?? null,
    },
  });
}

export async function getStats(userId: string) {
  const stats = await db.userStats.findUnique({ where: { userId } });
  if (!stats) throw new Error("UserStats row is missing");
  return stats;
}

/** The ledger sum — the value `UserStats.totalXp` must always agree with. */
export async function getLedgerTotal(userId: string): Promise<number> {
  const result = await db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}

export async function getLedgerRows(taskId: string) {
  return db.xpTransaction.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
}
