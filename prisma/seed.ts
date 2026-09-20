/**
 * Development seed data.
 *
 * Creates one demo account with a realistic spread of projects, milestones and
 * tasks, a few days of completion history, and the XP/streak state that
 * follows from it.
 *
 * Deterministic: every date is relative to the run, and the streak is derived
 * from the days that actually have completions rather than hard-coded.
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

interface SeedMilestone {
  key: string;
  title: string;
  description?: string;
  /** Days from today. */
  dueIn?: number;
  completed?: boolean;
}

interface SeedProject {
  key: string;
  name: string;
  description: string;
  color: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  startIn?: number;
  dueIn?: number;
  milestones: SeedMilestone[];
}

const PROJECTS: SeedProject[] = [
  {
    key: "iris",
    name: "IRIS AI Assistant",
    description: "Voice-driven desk assistant for the school exhibition.",
    color: "violet",
    priority: "URGENT",
    status: "ACTIVE",
    startIn: -21,
    dueIn: 24,
    milestones: [
      { key: "iris-hw", title: "Hardware", description: "Sensors, motors and the ESP32 wiring.", dueIn: -3, completed: true },
      { key: "iris-voice", title: "Voice System", description: "Wake word, capture and command parsing.", dueIn: 6 },
      { key: "iris-brain", title: "AI Brain", description: "Intent routing and the response pipeline.", dueIn: 13 },
      { key: "iris-exhibit", title: "Exhibition", description: "Stand, website and the live demo.", dueIn: 22 },
    ],
  },
  {
    key: "sat",
    name: "SAT Preparation",
    description: "Structured revision through to the December sitting.",
    color: "cyan",
    priority: "HIGH",
    status: "ACTIVE",
    startIn: -10,
    dueIn: 45,
    milestones: [
      { key: "sat-math", title: "Math", description: "Algebra, then data analysis.", dueIn: 12 },
      { key: "sat-rw", title: "Reading & Writing", dueIn: 26 },
      { key: "sat-tests", title: "Practice Tests", description: "Four full timed papers.", dueIn: 40 },
    ],
  },
  {
    key: "portfolio",
    name: "Portfolio",
    description: "Personal site — case studies and a proper performance budget.",
    color: "emerald",
    priority: "MEDIUM",
    status: "ACTIVE",
    startIn: -35,
    dueIn: 9,
    milestones: [
      { key: "pf-design", title: "Design", dueIn: -12, completed: true },
      { key: "pf-dev", title: "Development", dueIn: 2 },
      { key: "pf-perf", title: "Performance", description: "Under 1s on a mid-range phone.", dueIn: 6 },
      { key: "pf-deploy", title: "Deployment", dueIn: 9 },
    ],
  },
  {
    key: "robotics-regional",
    name: "Robotics Regionals",
    description: "Last season's competition build. Finished and filed away.",
    color: "amber",
    priority: "MEDIUM",
    status: "COMPLETED",
    startIn: -120,
    dueIn: -30,
    milestones: [
      { key: "rr-build", title: "Drivetrain", completed: true },
      { key: "rr-comp", title: "Competition", completed: true },
    ],
  },
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
  /** Keys into PROJECTS / its milestones. */
  project?: string;
  milestone?: string;
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
    project: "sat",
    milestone: "sat-math",
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
    project: "portfolio",
    milestone: "pf-dev",
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
    project: "iris",
    milestone: "iris-brain",
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
    project: "sat",
    milestone: "sat-tests",
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
    project: "portfolio",
    milestone: "pf-perf",
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
    // Project-level with no milestone: real projects always have work that
    // does not slot neatly into a checkpoint, and the detail page needs to
    // show that case.
    project: "iris",
  },
  {
    title: "Plan next sprint",
    priority: "MEDIUM",
    category: "Projects",
    xpReward: 20,
    dueIn: 5,
    // Deliberately project-level with no milestone, so the "unassigned tasks"
    // section of the detail page is exercised.
    project: "iris",
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
  // -- IRIS hardware: a finished milestone --------------------------------
  { title: "Wire ultrasonic sensors", priority: "HIGH", category: "Robotics", xpReward: 40, dueIn: -5, completedDaysAgo: 5, project: "iris", milestone: "iris-hw" },
  { title: "Connect DHT22", priority: "MEDIUM", category: "Robotics", xpReward: 20, dueIn: -4, completedDaysAgo: 4, project: "iris", milestone: "iris-hw" },
  { title: "Test ESP32 communication", priority: "HIGH", category: "Robotics", xpReward: 40, dueIn: -3, completedDaysAgo: 3, project: "iris", milestone: "iris-hw" },
  // -- IRIS voice: in progress ---------------------------------------------
  { title: "Implement voice command parser", priority: "URGENT", category: "Coding", xpReward: 60, dueIn: 4, estimatedMinutes: 180, project: "iris", milestone: "iris-voice" },
  { title: "Add wake-word detection", priority: "HIGH", category: "Coding", xpReward: 40, dueIn: 6, estimatedMinutes: 120, project: "iris", milestone: "iris-voice" },
  // -- IRIS exhibition ------------------------------------------------------
  { title: "Build exhibition website", priority: "HIGH", category: "Coding", xpReward: 40, dueIn: 18, estimatedMinutes: 240, project: "iris", milestone: "iris-exhibit" },
  { title: "Record demonstration video", priority: "MEDIUM", category: "Projects", xpReward: 20, dueIn: 21, estimatedMinutes: 90, project: "iris", milestone: "iris-exhibit" },
  // -- Portfolio: a finished design milestone ------------------------------
  { title: "Choose type scale", priority: "LOW", category: "Coding", xpReward: 10, dueIn: -14, completedDaysAgo: 14, project: "portfolio", milestone: "pf-design" },
  { title: "Draft case study layouts", priority: "MEDIUM", category: "Coding", xpReward: 20, dueIn: -12, completedDaysAgo: 12, project: "portfolio", milestone: "pf-design" },
  { title: "Ship deployment pipeline", priority: "MEDIUM", category: "Coding", xpReward: 20, dueIn: 9, estimatedMinutes: 60, project: "portfolio", milestone: "pf-deploy" },
  // -- SAT ------------------------------------------------------------------
  { title: "Algebra drill set 3", priority: "MEDIUM", category: "Study", xpReward: 20, dueIn: 8, estimatedMinutes: 60, project: "sat", milestone: "sat-math" },
  { title: "Grammar rules review", priority: "MEDIUM", category: "Study", xpReward: 20, dueIn: 20, estimatedMinutes: 45, project: "sat", milestone: "sat-rw" },

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

  // -- projects and their milestones ----------------------------------------
  const projectId = new Map<string, string>();
  const milestoneId = new Map<string, string>();

  for (const seedProject of PROJECTS) {
    const created = await prisma.project.create({
      data: {
        userId: user.id,
        name: seedProject.name,
        description: seedProject.description,
        color: seedProject.color,
        priority: seedProject.priority,
        status: seedProject.status,
        startDate: seedProject.startIn === undefined ? null : dateCol(seedProject.startIn),
        dueDate: seedProject.dueIn === undefined ? null : dateCol(seedProject.dueIn),
        completedAt: seedProject.status === "COMPLETED" ? instant(-28, 17) : null,
        archivedAt: seedProject.status === "ARCHIVED" ? instant(-28, 17) : null,
        createdAt: instant(seedProject.startIn ?? -30, 9),
      },
      select: { id: true },
    });
    projectId.set(seedProject.key, created.id);

    for (const [index, seedMilestone] of seedProject.milestones.entries()) {
      const milestone = await prisma.milestone.create({
        data: {
          projectId: created.id,
          title: seedMilestone.title,
          description: seedMilestone.description ?? null,
          dueDate: seedMilestone.dueIn === undefined ? null : dateCol(seedMilestone.dueIn),
          status: seedMilestone.completed ? "COMPLETED" : "PENDING",
          completedAt: seedMilestone.completed ? instant(seedMilestone.dueIn ?? -1, 16) : null,
          position: index,
        },
        select: { id: true },
      });
      milestoneId.set(seedMilestone.key, milestone.id);
    }
  }

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
        projectId: task.project ? (projectId.get(task.project) ?? null) : null,
        milestoneId: task.milestone ? (milestoneId.get(task.milestone) ?? null) : null,
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
  console.log(`  Projects  ${PROJECTS.length} (${PROJECTS.reduce((n, p) => n + p.milestones.length, 0)} milestones)`);
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
