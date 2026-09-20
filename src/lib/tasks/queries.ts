import "server-only";

import { getPriorityConfig } from "@/config/priorities";
import {
  addDays,
  dbDateToLocalDate,
  getLocalToday,
  localDateTimeToInstant,
  localDateToDbDate,
  type LocalDate,
} from "@/lib/datetime";
import { getXpForNextLevel, type LevelProgress } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import { getDisplayStreak, isStreakAtRisk } from "@/lib/streak";

/**
 * Read models.
 *
 * Server components hand these straight to client components, so everything
 * here is plain and serialisable: dates become `YYYY-MM-DD` strings rather
 * than `Date` objects, which also removes any chance of a timezone shift
 * happening during serialisation.
 */

export interface TaskView {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly completed: boolean;
  readonly priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  readonly categoryId: string | null;
  readonly category: CategoryView | null;
  readonly dueDate: LocalDate | null;
  readonly dueTime: string | null;
  readonly estimatedMinutes: number | null;
  readonly xpReward: number;
  readonly completedAt: string | null;
  readonly createdAt: string;
}

export interface CategoryView {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  completed: true,
  priority: true,
  categoryId: true,
  dueDate: true,
  dueTime: true,
  estimatedMinutes: true,
  xpReward: true,
  completedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, color: true } },
} as const;

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  categoryId: string | null;
  dueDate: Date | null;
  dueTime: string | null;
  estimatedMinutes: number | null;
  xpReward: number;
  completedAt: Date | null;
  createdAt: Date;
  category: { id: string; name: string; color: string } | null;
};

function toTaskView(row: TaskRow): TaskView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed,
    priority: row.priority,
    categoryId: row.categoryId,
    category: row.category,
    dueDate: dbDateToLocalDate(row.dueDate),
    dueTime: row.dueTime,
    estimatedMinutes: row.estimatedMinutes,
    xpReward: row.xpReward,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Orders tasks the way a person would: soonest deadline first, undated last,
 * then by urgency, then newest. Done in JS because it mixes a nullable date,
 * a nullable time and an enum weight — expressing that in SQL would cost more
 * than it saves at this scale.
 */
function byUrgency(a: TaskView, b: TaskView): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const aTime = a.dueTime ?? "99:99";
  const bTime = b.dueTime ?? "99:99";
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;

  const weightDelta = getPriorityConfig(b.priority).weight - getPriorityConfig(a.priority).weight;
  if (weightDelta !== 0) return weightDelta;

  return a.createdAt < b.createdAt ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(userId: string): Promise<CategoryView[]> {
  return prisma.category.findMany({
    where: { userId, isArchived: false },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Task list
// ---------------------------------------------------------------------------

export type TaskStatusFilter = "all" | "open" | "completed";

export interface TaskListFilters {
  readonly status?: TaskStatusFilter;
  readonly categoryId?: string | null;
  readonly priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  readonly search?: string | null;
}

export async function getTasks(userId: string, filters: TaskListFilters = {}): Promise<TaskView[]> {
  const { status = "all", categoryId = null, priority = null, search = null } = filters;

  const rows = await prisma.task.findMany({
    where: {
      userId,
      ...(status === "open" ? { completed: false } : {}),
      ...(status === "completed" ? { completed: true } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(priority ? { priority } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: TASK_SELECT,
    // Indexed ordering first; the JS pass below refines within the same day.
    orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const views = rows.map(toTaskView);
  const open = views.filter((t) => !t.completed).sort(byUrgency);
  const done = views
    .filter((t) => t.completed)
    .sort((a, b) => (a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1);

  return status === "completed" ? done : [...open, ...done];
}

export async function getTaskById(userId: string, taskId: string): Promise<TaskView | null> {
  const row = await prisma.task.findFirst({ where: { id: taskId, userId }, select: TASK_SELECT });
  return row ? toTaskView(row) : null;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DailyProgress {
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
  readonly xpEarnedToday: number;
}

export interface DashboardData {
  readonly today: LocalDate;
  readonly timezone: string;
  readonly progress: LevelProgress;
  readonly streak: {
    readonly current: number;
    readonly longest: number;
    readonly atRisk: boolean;
  };
  readonly daily: DailyProgress;
  readonly todayTasks: readonly TaskView[];
  readonly overdueTasks: readonly TaskView[];
  readonly upcomingTasks: readonly TaskView[];
  readonly deadlines: readonly TaskView[];
  readonly totalOpenTasks: number;
}

/** How far ahead "Upcoming" and "Deadlines" look. */
const UPCOMING_WINDOW_DAYS = 7;
const DEADLINE_WINDOW_DAYS = 14;

/**
 * Everything the dashboard renders, in one round trip.
 *
 * Deliberately a single function issuing a handful of parallel queries rather
 * than each panel fetching for itself: the panels share most of their data,
 * and one waterfall of six sequential queries is what makes a dashboard feel
 * slow.
 */
export async function getDashboardData(
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<DashboardData> {
  const today = getLocalToday(timezone, now);
  const todayDb = localDateToDbDate(today);
  const upcomingEnd = localDateToDbDate(addDays(today, UPCOMING_WINDOW_DAYS));
  const deadlineEnd = localDateToDbDate(addDays(today, DEADLINE_WINDOW_DAYS));
  const dayStart = startOfLocalDay(today, timezone);

  const [stats, todayRows, overdueRows, upcomingRows, deadlineRows, openCount, xpToday] =
    await Promise.all([
      prisma.userStats.findUnique({
        where: { userId },
        select: {
          totalXp: true,
          level: true,
          currentStreak: true,
          longestStreak: true,
          lastCompletedDate: true,
        },
      }),

      // Due today, plus anything finished today that was not scheduled for it —
      // ad-hoc work should still count towards the day.
      prisma.task.findMany({
        where: {
          userId,
          OR: [{ dueDate: todayDb }, { completed: true, completedAt: { gte: dayStart } }],
        },
        select: TASK_SELECT,
      }),

      prisma.task.findMany({
        where: { userId, completed: false, dueDate: { lt: todayDb } },
        select: TASK_SELECT,
        orderBy: { dueDate: "asc" },
        take: 50,
      }),

      prisma.task.findMany({
        where: { userId, completed: false, dueDate: { gt: todayDb, lte: upcomingEnd } },
        select: TASK_SELECT,
        orderBy: { dueDate: "asc" },
        take: 50,
      }),

      // "Deadlines" are the high-stakes subset, looking further ahead.
      prisma.task.findMany({
        where: {
          userId,
          completed: false,
          dueDate: { gte: todayDb, lte: deadlineEnd },
          priority: { in: ["HIGH", "URGENT"] },
        },
        select: TASK_SELECT,
        orderBy: { dueDate: "asc" },
        take: 10,
      }),

      prisma.task.count({ where: { userId, completed: false } }),

      prisma.xpTransaction.aggregate({
        where: { userId, createdAt: { gte: dayStart } },
        _sum: { amount: true },
      }),
    ]);

  const totalXp = stats?.totalXp ?? 0;
  const streakState = {
    currentStreak: stats?.currentStreak ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    lastCompletedDate: stats?.lastCompletedDate ?? null,
  };

  const todayTasks = todayRows.map(toTaskView).sort(byUrgency);
  const completed = todayTasks.filter((t) => t.completed).length;
  const total = todayTasks.length;

  return {
    today,
    timezone,
    progress: getXpForNextLevel(totalXp),
    streak: {
      current: getDisplayStreak(streakState, today),
      longest: streakState.longestStreak,
      atRisk: isStreakAtRisk(streakState, today),
    },
    daily: {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      xpEarnedToday: Math.max(0, xpToday._sum.amount ?? 0),
    },
    todayTasks,
    overdueTasks: overdueRows.map(toTaskView),
    upcomingTasks: upcomingRows.map(toTaskView).sort(byUrgency),
    deadlines: deadlineRows.map(toTaskView),
    totalOpenTasks: openCount,
  };
}

/** The instant the user's current day began, for filtering timestamp columns. */
function startOfLocalDay(today: LocalDate, timezone: string): Date {
  return localDateTimeToInstant(today, "00:00", timezone);
}
