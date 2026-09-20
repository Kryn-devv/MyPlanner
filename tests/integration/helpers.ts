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
    completed: boolean;
    projectId: string | null;
    milestoneId: string | null;
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
      completed: overrides.completed ?? false,
      completedAt: overrides.completed ? new Date() : null,
      completionCount: overrides.completed ? 1 : 0,
      projectId: overrides.projectId ?? null,
      milestoneId: overrides.milestoneId ?? null,
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

// ---------------------------------------------------------------------------
// Phase 2 fixtures
// ---------------------------------------------------------------------------

export async function createTestProject(
  userId: string,
  overrides: Partial<{
    name: string;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate: Date | null;
    color: string;
  }> = {},
) {
  return db.project.create({
    data: {
      userId,
      name: overrides.name ?? "Test project",
      status: overrides.status ?? "ACTIVE",
      priority: overrides.priority ?? "MEDIUM",
      dueDate: overrides.dueDate ?? null,
      color: overrides.color ?? "violet",
    },
  });
}

export async function createTestMilestone(
  projectId: string,
  overrides: Partial<{
    title: string;
    status: "PENDING" | "COMPLETED";
    dueDate: Date | null;
    position: number;
  }> = {},
) {
  return db.milestone.create({
    data: {
      projectId,
      title: overrides.title ?? "Test milestone",
      status: overrides.status ?? "PENDING",
      dueDate: overrides.dueDate ?? null,
      position: overrides.position ?? 0,
    },
  });
}

/** Reads a task's assignment straight from the database. */
export async function getAssignment(taskId: string) {
  return db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true, milestoneId: true },
  });
}
