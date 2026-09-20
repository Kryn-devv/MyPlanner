/**
 * Development seed data.
 *
 * Creates one demo account with a realistic spread of tasks, a few days of
 * completion history and the XP/streak state that follows from it.
 *
 * Everything it writes is tagged to the demo user, so `--clean` removes it
 * without touching any other account:
 *
 *     npm run db:seed      # create (idempotent — re-running resets the demo)
 *     npm run db:unseed    # remove
 *
 * Written in erasable-syntax-only TypeScript so Node can run it directly with
 * no extra transpiler dependency.
 */

import { randomBytes, scryptSync } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const DEMO_EMAIL = "demo@nova.test";
const DEMO_PASSWORD = "demo-password";
const DEMO_TIMEZONE = "UTC";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// -- helpers ----------------------------------------------------------------

/** Mirrors src/lib/auth/password.ts so seeded accounts can actually sign in. */
function hashPassword(password: string): string {
  const N = 2 ** 16;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, 64, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
  return ["scrypt", N, r, p, salt.toString("base64"), derived.toString("base64")].join("$");
}

/** Mirrors src/lib/leveling.ts. */
function calculateLevel(totalXp: number): number {
  if (totalXp <= 0) return 1;
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * totalXp) / 100)) / 2));
  while (50 * (level + 1) * level <= totalXp) level++;
  while (level > 1 && 50 * level * (level - 1) > totalXp) level--;
  return level;
}

const DAY_MS = 86_400_000;

/** A calendar day offset from today, as `YYYY-MM-DD`. */
function day(offset: number): string {
  return new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Midnight UTC for a DATE column. */
function dateCol(offset: number): Date {
  return new Date(`${day(offset)}T00:00:00.000Z`);
}

/** An instant at a given hour on a given day. */
function instant(offset: number, hour: number): Date {
  return new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

// -- data -------------------------------------------------------------------

const CATEGORIES = [
  { name: "Study", color: "violet" },
  { name: "Coding", color: "cyan" },
  { name: "Robotics", color: "amber" },
  { name: "Personal", color: "emerald" },
  { name: "School", color: "indigo" },
  { name: "Projects", color: "rose" },
];

interface SeedTask {
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  category: string;
  xpReward: number;
  /** Days from today. */
  dueIn: number | null;
  dueTime?: string;
  estimatedMinutes?: number;
  /** Days ago it was completed, if it is done. */
  completedDaysAgo?: number;
}

const TASKS: SeedTask[] = [
  // -- done today, so the dashboard shows real progress --------------------
  {
    title: "Finish Chemistry notes",
    description: "Organic reaction mechanisms — chapters 7 and 8.",
    priority: "HIGH",
    category: "Study",
    xpReward: 40,
    dueIn: 0,
    estimatedMinutes: 60,
    completedDaysAgo: 0,
  },
  {
    title: "Complete Java practice",
    description: "Two array problems and one on recursion.",
    priority: "MEDIUM",
    category: "Coding",
    xpReward: 20,
    dueIn: 0,
    estimatedMinutes: 45,
    completedDaysAgo: 0,
  },
  // -- still open today -----------------------------------------------------
  {
    title: "Work on IRIS",
    description: "Wire the ingestion pipeline to the new schema and test end to end.",
    priority: "URGENT",
    category: "Projects",
    xpReward: 60,
    dueIn: 0,
    dueTime: "19:00",
    estimatedMinutes: 120,
  },
  {
    title: "SAT preparation",
    description: "One timed maths section, then review every mistake.",
    priority: "HIGH",
    category: "Study",
    xpReward: 50,
    dueIn: 0,
    dueTime: "17:00",
    estimatedMinutes: 90,
  },
  {
    title: "Read chapter",
    priority: "LOW",
    category: "Personal",
    xpReward: 10,
    dueIn: 0,
    estimatedMinutes: 30,
  },
  // -- upcoming -------------------------------------------------------------
  {
    title: "English project",
    description: "Final draft of the comparative essay.",
    priority: "URGENT",
    category: "School",
    xpReward: 60,
    dueIn: 1,
    dueTime: "09:00",
    estimatedMinutes: 150,
  },
  {
    title: "Fix portfolio animation",
    description: "The hero transition stutters on Safari.",
    priority: "MEDIUM",
    category: "Coding",
    xpReward: 20,
    dueIn: 2,
    estimatedMinutes: 40,
  },
  {
    title: "Robotics build session",
    description: "Mount the new drivetrain and re-run the calibration.",
    priority: "HIGH",
    category: "Robotics",
    xpReward: 40,
    dueIn: 3,
    dueTime: "16:30",
    estimatedMinutes: 120,
  },
  {
    title: "Plan next sprint",
    priority: "MEDIUM",
    category: "Projects",
    xpReward: 20,
    dueIn: 5,
  },
  // -- overdue, so the overdue panel is exercised ---------------------------
  {
    title: "Return library books",
    priority: "LOW",
    category: "Personal",
    xpReward: 10,
    dueIn: -2,
  },
  // -- no due date ----------------------------------------------------------
  {
    title: "Refactor auth module",
    description: "Split session handling out of the request helpers.",
    priority: "LOW",
    category: "Coding",
    xpReward: 10,
    dueIn: null,
  },
  // -- history, to build a streak ------------------------------------------
  { title: "Physics problem set", priority: "HIGH", category: "Study", xpReward: 40, dueIn: -1, completedDaysAgo: 1 },
  { title: "Daily code review", priority: "MEDIUM", category: "Coding", xpReward: 20, dueIn: -1, completedDaysAgo: 1 },
  { title: "Maths revision", priority: "MEDIUM", category: "Study", xpReward: 20, dueIn: -2, completedDaysAgo: 2 },
  { title: "Team stand-up notes", priority: "LOW", category: "Projects", xpReward: 10, dueIn: -3, completedDaysAgo: 3 },
];

// -- operations -------------------------------------------------------------

async function clean(): Promise<void> {
  const result = await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  if (result.count > 0) {
    console.log(`Removed the demo account (${DEMO_EMAIL}) and everything belonging to it.`);
  } else {
    console.log("No demo account found — nothing to remove.");
  }
}

async function seed(): Promise<void> {
  // Start from scratch so re-seeding is idempotent rather than cumulative.
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Alex Rivera",
      timezone: DEMO_TIMEZONE,
      passwordHash: hashPassword(DEMO_PASSWORD),
      stats: { create: {} },
      categories: { create: CATEGORIES },
    },
    select: { id: true, categories: { select: { id: true, name: true } } },
  });

  const categoryId = new Map(user.categories.map((c) => [c.name, c.id]));

  let totalXp = 0;
  let tasksCompleted = 0;
  const completedDays = new Set<string>();

  for (const task of TASKS) {
    const isComplete = task.completedDaysAgo !== undefined;
    const completedAt = isComplete ? instant(-(task.completedDaysAgo as number), 14) : null;

    const created = await prisma.task.create({
      data: {
        userId: user.id,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority,
        categoryId: categoryId.get(task.category) ?? null,
        dueDate: task.dueIn === null ? null : dateCol(task.dueIn),
        dueTime: task.dueTime ?? null,
        estimatedMinutes: task.estimatedMinutes ?? null,
        xpReward: task.xpReward,
        completed: isComplete,
        completedAt,
        completionCount: isComplete ? 1 : 0,
        // Tasks are created a little before they are due.
        createdAt: instant(task.dueIn === null ? -4 : Math.min(task.dueIn, 0) - 1, 9),
      },
      select: { id: true },
    });

    if (isComplete && completedAt) {
      // Write the matching ledger row, exactly as the app would.
      await prisma.xpTransaction.create({
        data: {
          userId: user.id,
          taskId: created.id,
          amount: task.xpReward,
          kind: "AWARD",
          cycle: 1,
          source: "TASK_COMPLETION",
          description: `Completed “${task.title}”`,
          createdAt: completedAt,
        },
      });

      totalXp += task.xpReward;
      tasksCompleted += 1;
      completedDays.add(day(-(task.completedDaysAgo as number)));
    }
  }

  // Derive the streak from the days that actually have completions, rather
  // than hard-coding a number that would contradict the seeded history.
  const sortedDays = [...completedDays].sort();
  let currentStreak = 0;
  let cursor = day(0);
  while (completedDays.has(cursor)) {
    currentStreak += 1;
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  }

  await prisma.userStats.update({
    where: { userId: user.id },
    data: {
      totalXp,
      level: calculateLevel(totalXp),
      tasksCompleted,
      currentStreak,
      longestStreak: Math.max(currentStreak, 12),
      lastCompletedDate: sortedDays.at(-1) ?? null,
    },
  });

  console.log("Seeded the demo account.\n");
  console.log(`  Email     ${DEMO_EMAIL}`);
  console.log(`  Password  ${DEMO_PASSWORD}`);
  console.log(`  Tasks     ${TASKS.length} (${tasksCompleted} completed)`);
  console.log(`  XP        ${totalXp} — level ${calculateLevel(totalXp)}`);
  console.log(`  Streak    ${currentStreak} day${currentStreak === 1 ? "" : "s"}\n`);
  console.log("Remove it again with: npm run db:unseed");
}

const shouldClean = process.argv.includes("--clean");

try {
  await (shouldClean ? clean() : seed());
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
