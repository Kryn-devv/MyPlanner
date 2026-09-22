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
    dueTime: string | null;
    estimatedMinutes: number | null;
    categoryId: string | null;
    completed: boolean;
    /** Overrides the completion instant, for day-window tests. */
    completedAt: Date | null;
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
      dueTime: overrides.dueTime ?? null,
      categoryId: overrides.categoryId ?? null,
      estimatedMinutes: overrides.estimatedMinutes ?? null,
      completed: overrides.completed ?? false,
      completedAt: overrides.completedAt ?? (overrides.completed ? new Date() : null),
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
    startDate: Date | null;
    dueDate: Date | null;
    color: string;
    goalId: string | null;
  }> = {},
) {
  return db.project.create({
    data: {
      userId,
      name: overrides.name ?? "Test project",
      status: overrides.status ?? "ACTIVE",
      priority: overrides.priority ?? "MEDIUM",
      startDate: overrides.startDate ?? null,
      dueDate: overrides.dueDate ?? null,
      color: overrides.color ?? "violet",
      goalId: overrides.goalId ?? null,
    },
  });
}

export async function createTestGoal(
  userId: string,
  overrides: Partial<{
    title: string;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    startDate: Date | null;
    targetDate: Date | null;
  }> = {},
) {
  return db.goal.create({
    data: {
      userId,
      title: overrides.title ?? "Test goal",
      status: overrides.status ?? "ACTIVE",
      priority: overrides.priority ?? "MEDIUM",
      startDate: overrides.startDate ?? null,
      targetDate: overrides.targetDate ?? null,
    },
  });
}

/** Reads a project's goal straight from the database. */
export async function getProjectGoal(projectId: string) {
  const row = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { goalId: true },
  });
  return row.goalId;
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

// ---------------------------------------------------------------------------
// Phase 4.3 fixtures
// ---------------------------------------------------------------------------

/**
 * Writes a focus session directly, bypassing the service.
 *
 * Used to set up history and to construct states the service would refuse to
 * create, so the read layer and the state machine can be tested against rows
 * that already exist rather than only against ones this run produced.
 */
export async function createTestFocusSession(
  userId: string,
  overrides: Partial<{
    taskId: string | null;
    status: "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
    accumulatedSeconds: number;
    segmentStartedAt: Date | null;
    startedAt: Date;
    endedAt: Date | null;
    targetMinutes: number | null;
  }> = {},
) {
  const status = overrides.status ?? "COMPLETED";
  const startedAt = overrides.startedAt ?? new Date();

  return db.focusSession.create({
    data: {
      userId,
      taskId: overrides.taskId ?? null,
      status,
      accumulatedSeconds: overrides.accumulatedSeconds ?? 0,
      segmentStartedAt:
        overrides.segmentStartedAt ?? (status === "RUNNING" ? startedAt : null),
      startedAt,
      endedAt:
        overrides.endedAt ?? (status === "COMPLETED" || status === "CANCELLED" ? new Date() : null),
      targetMinutes: overrides.targetMinutes ?? null,
    },
  });
}

/** Reads a session straight from the database. */
export async function getFocusSession(sessionId: string) {
  return db.focusSession.findUniqueOrThrow({ where: { id: sessionId } });
}

/** Every focus session a user has, oldest first. */
export async function listFocusSessions(userId: string) {
  return db.focusSession.findMany({ where: { userId }, orderBy: { startedAt: "asc" } });
}

// ---------------------------------------------------------------------------
// Phase 4.4 fixtures
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" → the midnight-UTC `Date` a DATE column stores. */
const dateColumn = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/**
 * Writes a habit directly, bypassing the service.
 *
 * Dates are calendar days as strings, exactly as the app addresses them, so a
 * test reads like the schedule it describes.
 */
export async function createTestHabit(
  userId: string,
  overrides: Partial<{
    name: string;
    description: string | null;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
    frequency: "DAILY" | "WEEKDAYS" | "WEEKLY";
    /** 0 = Sunday … 6 = Saturday. */
    weekdays: number[];
    weeklyTarget: number | null;
    xpReward: number;
    startDate: string;
    endDate: string | null;
    archivedAt: Date | null;
  }> = {},
) {
  return db.habit.create({
    data: {
      userId,
      name: overrides.name ?? "Test habit",
      description: overrides.description ?? null,
      status: overrides.status ?? "ACTIVE",
      frequency: overrides.frequency ?? "DAILY",
      weekdays: overrides.weekdays ?? [],
      weeklyTarget: overrides.weeklyTarget ?? null,
      xpReward: overrides.xpReward ?? 10,
      startDate: dateColumn(overrides.startDate ?? "2026-09-01"),
      endDate: overrides.endDate ? dateColumn(overrides.endDate) : null,
      archivedAt: overrides.archivedAt ?? null,
    },
  });
}

/** Records a completed occurrence directly — history the service did not write. */
export async function createTestHabitCompletion(
  habitId: string,
  date: string,
  completedAt: Date = dateColumn(date),
) {
  return db.habitCompletion.create({
    data: { habitId, completedDate: dateColumn(date), completedAt },
  });
}

/** Records a paused period directly; `end` null means still paused. */
export async function createTestHabitPause(habitId: string, start: string, end: string | null) {
  return db.habitPause.create({
    data: { habitId, startDate: dateColumn(start), endDate: end ? dateColumn(end) : null },
  });
}

/** Reads a habit straight from the database, with its pause log. */
export async function getHabit(habitId: string) {
  return db.habit.findUniqueOrThrow({
    where: { id: habitId },
    include: { pauses: { orderBy: { startDate: "asc" } } },
  });
}

/** A habit's completion days, oldest first, as "YYYY-MM-DD". */
export async function listHabitCompletionDates(habitId: string): Promise<string[]> {
  const rows = await db.habitCompletion.findMany({
    where: { habitId },
    select: { completedDate: true },
    orderBy: { completedDate: "asc" },
  });
  return rows.map((row) => row.completedDate.toISOString().slice(0, 10));
}

/** Every ledger row habits wrote for a user, oldest first. */
export async function getHabitLedgerRows(userId: string) {
  return db.xpTransaction.findMany({
    where: { userId, source: "HABIT_COMPLETION" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Password reset fixtures
// ---------------------------------------------------------------------------

/** A sent message, as the reset flow hands it to its transport. */
export interface CapturedEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * A transport that records instead of sending.
 *
 * Reports itself as SMTP so the flow behaves exactly as it would with real
 * email configured — no test ever reaches a mail server.
 */
export function createCapturingTransport() {
  const sent: CapturedEmail[] = [];
  return {
    sent,
    transport: {
      kind: "smtp" as const,
      async send(message: CapturedEmail) {
        sent.push(message);
      },
    },
  };
}

/**
 * Stands in for Next's `after`: collects the work the request deferred, so a
 * test can let the response "go out" first and then wait for what follows.
 */
export function createDeferredQueue() {
  const pending: Promise<void>[] = [];
  return {
    defer: (task: () => Promise<void>) => {
      pending.push(task());
    },
    /** How many tasks were handed over, flushed or not. */
    get scheduled() {
      return pending.length;
    },
    async flush(): Promise<void> {
      await Promise.all(pending);
    },
  };
}

/** Pulls the raw token back out of the link in a captured email. */
export function tokenFromEmail(message: CapturedEmail): string {
  const match = message.text.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("No reset link in the captured email");
  return match[1];
}

/** Every reset token row a user has, oldest first. */
export async function listResetTokens(userId: string) {
  return db.passwordResetToken.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

/**
 * Writes a session row directly.
 *
 * `createSession` sets a cookie and so needs a request; the rows are all a
 * revocation test needs to observe.
 */
export async function createTestSession(userId: string) {
  counter += 1;
  return db.session.create({
    data: {
      userId,
      tokenHash: `test-session-${counter}-${Date.now()}-${Math.random()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

/** A user's stored password hash, straight from the database. */
export async function getPasswordHash(userId: string): Promise<string> {
  const row = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  return row.passwordHash;
}
