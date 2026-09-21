import "server-only";

import {
  UNSCHEDULED_PREVIEW_COUNT,
  UPCOMING_PREVIEW_COUNT,
  UPCOMING_WINDOW_DAYS,
} from "@/config/today";
import {
  addDays,
  localDateTimeToInstant,
  localDateToDbDate,
  dbDateToLocalDate,
  type LocalDate,
} from "@/lib/datetime";
import { getFocusSecondsByTask, getTrackedFocusSeconds } from "@/lib/focus/queries";
import { prisma } from "@/lib/prisma";
import { getDisplayStreak, isStreakAtRisk } from "@/lib/streak";
import {
  getDayRelation,
  isTaskOverdue,
  progressFromTotals,
  sortTodayTasks,
  splitDaySections,
  workloadFromTotals,
  type DayProgress,
  type DaySections,
  type Workload,
} from "./logic";
import type { DayRelation } from "./logic";
import type { TodayTask } from "./types";

/**
 * The Today page's read layer.
 *
 * Today owns no data. A day is a query over the `dueDate` column that already
 * exists on `Task` — there is no daily plan, no schedule row and no second
 * copy of a task anywhere. Moving a task between days means editing that one
 * column, through the task form that already does it.
 *
 * Every query here is bounded and scoped by `userId` in its WHERE clause. None
 * of them reads the user's task history to filter it afterwards: a day is a
 * handful of rows, the overdue list is capped, and the previews are capped
 * with a separate count so the page can say how much it is not showing.
 */

/**
 * Sections are capped, and the page says so when a cap bites.
 *
 * The day's own list is capped too, but its progress and workload come from
 * aggregates rather than from the rows that loaded — a cap must bound a read,
 * never quietly change a number.
 */
const MAX_DAY_TASKS = 200;
const MAX_OVERDUE = 50;
const MAX_ALSO_COMPLETED = 20;

/**
 * Selected rather than joined wholesale. The extra hop over `TaskView` is the
 * project's goal: a Today row shows what the work ladders up to, and fetching
 * it here rather than per row is the difference between one join and an N+1.
 */
const TODAY_TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  completed: true,
  priority: true,
  categoryId: true,
  category: { select: { id: true, name: true, color: true } },
  dueDate: true,
  dueTime: true,
  estimatedMinutes: true,
  xpReward: true,
  completedAt: true,
  createdAt: true,
  projectId: true,
  milestoneId: true,
  project: {
    select: {
      id: true,
      name: true,
      color: true,
      goal: { select: { id: true, title: true } },
    },
  },
  milestone: { select: { id: true, title: true } },
} as const;

type TodayTaskRow = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  categoryId: string | null;
  category: { id: string; name: string; color: string } | null;
  dueDate: Date | null;
  dueTime: string | null;
  estimatedMinutes: number | null;
  xpReward: number;
  completedAt: Date | null;
  createdAt: Date;
  projectId: string | null;
  milestoneId: string | null;
  project: {
    id: string;
    name: string;
    color: string;
    goal: { id: string; title: string } | null;
  } | null;
  milestone: { id: string; title: string } | null;
};

function toTodayTask(row: TodayTaskRow, today: LocalDate): TodayTask {
  const dueDate = dbDateToLocalDate(row.dueDate);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed,
    priority: row.priority,
    categoryId: row.categoryId,
    category: row.category,
    dueDate,
    dueTime: row.dueTime,
    estimatedMinutes: row.estimatedMinutes,
    xpReward: row.xpReward,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    projectId: row.projectId,
    project: row.project,
    milestoneId: row.milestoneId,
    milestone: row.milestone,
    // Resolved once, against the real current date, so every consumer of the
    // DTO agrees about what is late.
    isOverdue: isTaskOverdue({ completed: row.completed, dueDate }, today),
  };
}

/** A capped list, plus the true total, so the page never implies it showed all. */
export interface CappedTasks {
  readonly tasks: readonly TodayTask[];
  readonly total: number;
  readonly truncated: boolean;
}

function capped(tasks: TodayTask[], total: number): CappedTasks {
  return { tasks, total, truncated: total > tasks.length };
}

export interface TodayData {
  /** The user's real current date. */
  readonly today: LocalDate;
  /** The day being viewed. */
  readonly selectedDate: LocalDate;
  readonly relation: DayRelation;
  readonly timezone: string;

  /** Tasks dated the selected day, split the way the page renders them. */
  readonly sections: DaySections;
  readonly progress: DayProgress;
  readonly workload: Workload;
  /** True when the day holds more tasks than the list shows. */
  readonly dayTruncated: boolean;

  /** Outstanding work from other days, late as of the real current date. */
  readonly overdue: CappedTasks;
  /** Finished on the selected day but dated elsewhere — ad-hoc work. */
  readonly alsoCompleted: CappedTasks;
  readonly upcoming: CappedTasks;
  readonly unscheduled: CappedTasks;

  /** Completed focus seconds recorded on the selected day. */
  readonly trackedFocusSeconds: number;
  /** Tracked focus per task, for the day's rows. Completed sessions only. */
  readonly trackedByTask: ReadonlyMap<string, number>;

  /** Signed sum of the XP ledger for the selected day. Read-only. */
  readonly xpEarned: number;
  readonly streak: { readonly current: number; readonly atRisk: boolean };
}

/**
 * Everything the Today page renders.
 *
 * One function issuing its reads in parallel rather than each section
 * fetching for itself — the same shape `getDashboardData` uses, and for the
 * same reason: a waterfall of sequential queries is what makes a page feel
 * slow. They are dispatched together but share the connection pool, so this
 * is a small number of bounded, indexed reads rather than literally one round
 * trip; each one is covered by an existing index on `(userId, ...)`.
 */
export async function getTodayData(
  userId: string,
  timezone: string,
  selectedDate: LocalDate,
  today: LocalDate,
): Promise<TodayData> {
  const selectedDb = localDateToDbDate(selectedDate);
  const todayDb = localDateToDbDate(today);

  // The selected day's own instant window, for the timestamp columns.
  const dayStart = localDateTimeToInstant(selectedDate, "00:00", timezone);
  const dayEnd = localDateTimeToInstant(addDays(selectedDate, 1), "00:00", timezone);

  // "Upcoming" means after the day on screen *and* still ahead of now, so the
  // preview never offers a day that has already gone.
  const upcomingFrom = addDays(selectedDate, 1) > today ? addDays(selectedDate, 1) : today;
  const upcomingFromDb = localDateToDbDate(upcomingFrom);
  const upcomingToDb = localDateToDbDate(addDays(upcomingFrom, UPCOMING_WINDOW_DAYS - 1));

  // Outstanding before today, excluding the day on screen — the day section
  // already owns those, and a task must appear in exactly one place.
  const overdueWhere = {
    userId,
    completed: false,
    dueDate: { lt: todayDb, not: selectedDb },
  } as const;

  // "Finished on this day but not part of it." Written as an explicit OR
  // rather than `NOT: { dueDate: selectedDb }`: in SQL, `NOT (NULL = x)` is
  // NULL, not true, so a bare NOT silently drops every dateless task — and a
  // dateless task finished today would then appear nowhere on the page at all.
  const alsoCompletedWhere = {
    userId,
    completed: true,
    completedAt: { gte: dayStart, lt: dayEnd },
    OR: [{ dueDate: null }, { dueDate: { not: selectedDb } }],
  };

  const upcomingWhere = {
    userId,
    completed: false,
    dueDate: { gte: upcomingFromDb, lte: upcomingToDb },
  } as const;

  const unscheduledWhere = { userId, completed: false, dueDate: null } as const;

  const [
    dayRows,
    dayCounts,
    dayEstimates,
    overdueRows,
    overdueCount,
    alsoCompletedRows,
    alsoCompletedCount,
    upcomingRows,
    upcomingCount,
    unscheduledRows,
    unscheduledCount,
    xp,
    stats,
    trackedFocusSeconds,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId, dueDate: selectedDb },
      select: TODAY_TASK_SELECT,
      orderBy: [{ dueTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: MAX_DAY_TASKS,
    }),

    // The day's figures come from aggregates, not from the rows above.
    // Counting the loaded rows would let a cap change a number rather than
    // bound a read — the same reason project and goal progress are grouped
    // aggregates rather than loaded lists.
    prisma.task.groupBy({
      by: ["completed"],
      where: { userId, dueDate: selectedDb },
      _count: { _all: true },
    }),

    // Estimates are summed separately, filtered to usable ones. A nullable
    // column that can also hold zero or a negative cannot simply be summed:
    // the pure rule ignores those, so the aggregate has to as well, or the
    // page and the tests would disagree about the same day.
    prisma.task.groupBy({
      by: ["completed"],
      where: { userId, dueDate: selectedDb, estimatedMinutes: { gt: 0 } },
      _count: { _all: true },
      _sum: { estimatedMinutes: true },
    }),

    prisma.task.findMany({
      where: overdueWhere,
      select: TODAY_TASK_SELECT,
      // The id breaks every remaining tie, so *which* 50 a capped list shows
      // cannot vary between two renders of the same data.
      orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: MAX_OVERDUE,
    }),
    prisma.task.count({ where: overdueWhere }),

    prisma.task.findMany({
      where: alsoCompletedWhere,
      select: TODAY_TASK_SELECT,
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
      take: MAX_ALSO_COMPLETED,
    }),
    prisma.task.count({ where: alsoCompletedWhere }),

    // Open work only: this is a preview of what is left to do, not a census
    // of the days ahead. `classifyTask` answers the wider question of which
    // bucket a task belongs to, including finished ones.
    prisma.task.findMany({
      where: upcomingWhere,
      select: TODAY_TASK_SELECT,
      orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: UPCOMING_PREVIEW_COUNT,
    }),
    prisma.task.count({ where: upcomingWhere }),

    prisma.task.findMany({
      where: unscheduledWhere,
      select: TODAY_TASK_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: UNSCHEDULED_PREVIEW_COUNT,
    }),
    prisma.task.count({ where: unscheduledWhere }),

    // The ledger is the only source of XP. This reads it; nothing here writes.
    prisma.xpTransaction.aggregate({
      where: { userId, createdAt: { gte: dayStart, lt: dayEnd } },
      _sum: { amount: true },
    }),

    prisma.userStats.findUnique({
      where: { userId },
      select: { currentStreak: true, longestStreak: true, lastCompletedDate: true },
    }),

    // Focus is recorded, not derived: this is the one figure on the page that
    // says what was actually tracked rather than what was planned.
    getTrackedFocusSeconds(userId, dayStart, dayEnd),
  ]);

  const toView = (rows: TodayTaskRow[]): TodayTask[] =>
    sortTodayTasks(rows.map((row) => toTodayTask(row, today)));

  const dayTasks = toView(dayRows);
  const overdueTasks = toView(overdueRows);
  const alsoCompletedTasks = alsoCompletedRows.map((row) => toTodayTask(row, today));

  // One grouped aggregate covering every task the page will render — not just
  // the day's own. The overdue and also-completed sections show task rows too,
  // and a map built from one section leaves the others permanently at zero.
  const trackedByTask = await getFocusSecondsByTask(userId, [
    ...dayTasks.map((task) => task.id),
    ...overdueTasks.map((task) => task.id),
    ...alsoCompletedTasks.map((task) => task.id),
  ]);

  let total = 0;
  let completedCount = 0;
  for (const group of dayCounts) {
    total += group._count._all;
    if (group.completed) completedCount += group._count._all;
  }

  let estimatedCount = 0;
  let plannedMinutes = 0;
  let completedMinutes = 0;
  for (const group of dayEstimates) {
    const minutes = group._sum.estimatedMinutes ?? 0;
    estimatedCount += group._count._all;
    plannedMinutes += minutes;
    if (group.completed) completedMinutes += minutes;
  }

  const streakState = {
    currentStreak: stats?.currentStreak ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    lastCompletedDate: stats?.lastCompletedDate ?? null,
  };

  return {
    today,
    selectedDate,
    relation: getDayRelation({ today, selectedDate }),
    timezone,

    sections: splitDaySections(dayTasks),
    progress: progressFromTotals({ total, completed: completedCount }),
    workload: workloadFromTotals({
      plannedMinutes,
      completedMinutes,
      estimatedCount,
      taskCount: total,
    }),
    dayTruncated: total > dayTasks.length,

    overdue: capped(overdueTasks, overdueCount),
    // Kept in completion order rather than the task ordering: this is a record
    // of how the day actually went.
    alsoCompleted: capped(alsoCompletedTasks, alsoCompletedCount),
    upcoming: capped(toView(upcomingRows), upcomingCount),
    unscheduled: capped(toView(unscheduledRows), unscheduledCount),

    trackedFocusSeconds,
    trackedByTask,

    xpEarned: xp._sum.amount ?? 0,
    // Reused, never recomputed: the streak has one implementation.
    streak: {
      current: getDisplayStreak(streakState, today),
      atRisk: isStreakAtRisk(streakState, today),
    },
  };
}
