import "server-only";

import {
  HABIT_HISTORY_DAYS,
  HISTORY_GRID_WEEKS,
  RECENT_COMPLETIONS_LIMIT,
  type HabitStatusFilter,
} from "@/config/habits";
import type { HabitFrequency, HabitStatus } from "@/generated/prisma/enums";
import {
  addDays,
  dbDateToLocalDate,
  getLocalToday,
  localDateToDbDate,
  type LocalDate,
} from "@/lib/datetime";
import { getWeekDays, startOfWeek } from "@/lib/calendar/range";
import { prisma } from "@/lib/prisma";
import {
  compareHabitsForDay,
  completionRate,
  computeHabitStreaks,
  dayState,
  isHabitScheduledOnDate,
  pausedFor,
  weeklyProgress,
  type CompletionRate,
  type DayState,
  type HabitSchedule,
  type HabitStreaks,
} from "./logic";
import { toSchedule } from "./service";

/**
 * Habit reads.
 *
 * Streaks and rates are derived here from a bounded window of completion
 * *dates* — never stored, never counted from rows loaded one habit at a time.
 * Every page that shows several habits loads their completions in one query
 * and folds them in memory; the window (`HABIT_HISTORY_DAYS`) is what keeps
 * that read bounded however long a habit has existed.
 *
 * Every query is scoped by `userId`. Completions have no owner column of their
 * own — ownership flows through the habit, as a milestone's does through its
 * project — so they are always filtered through `habit: { userId }`.
 */

/** The list page never shows more than this; beyond it, search. */
const MAX_HABITS = 200;

export interface HabitView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: HabitStatus;
  readonly frequency: HabitFrequency;
  readonly weekdays: readonly number[];
  readonly weeklyTarget: number | null;
  readonly xpReward: number;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
  readonly createdAt: string;
  readonly archivedAt: string | null;
  /** Days the current pause has run, when paused. */
  readonly pausedForDays: number | null;
}

/** A habit as it reads on one day — the row Today and the dashboard draw. */
export interface HabitDayView extends HabitView {
  readonly date: LocalDate;
  /** Due on this day under its schedule. */
  readonly due: boolean;
  readonly completed: boolean;
  readonly streaks: HabitStreaks;
  /** For WEEKLY habits: this week's count against the target. */
  readonly weekly: { readonly done: number; readonly target: number } | null;
}

/** A habit on the list page: today's state plus a month's rate. */
export interface HabitSummaryView extends HabitDayView {
  readonly rate30: CompletionRate;
}

const HABIT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  frequency: true,
  weekdays: true,
  weeklyTarget: true,
  xpReward: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  archivedAt: true,
  pauses: { select: { startDate: true, endDate: true } },
} as const;

type HabitRow = {
  id: string;
  name: string;
  description: string | null;
  status: HabitStatus;
  frequency: HabitFrequency;
  weekdays: number[];
  weeklyTarget: number | null;
  xpReward: number;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  pauses: { startDate: Date; endDate: Date | null }[];
};

function toView(row: HabitRow, schedule: HabitSchedule, today: LocalDate): HabitView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    frequency: row.frequency,
    weekdays: row.weekdays,
    weeklyTarget: row.weeklyTarget,
    xpReward: row.xpReward,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    pausedForDays: row.status === "PAUSED" ? pausedFor(schedule, today) : null,
  };
}

/**
 * Completion dates for several habits inside the history window, grouped.
 *
 * One query however many habits are on the page. Bounded by the window on one
 * side and the habit cap on the other; the rows are two columns wide.
 */
async function loadCompletionSets(
  userId: string,
  habitIds: readonly string[],
  today: LocalDate,
): Promise<Map<string, Set<LocalDate>>> {
  const sets = new Map<string, Set<LocalDate>>();
  for (const id of habitIds) sets.set(id, new Set());
  if (habitIds.length === 0) return sets;

  const rows = await prisma.habitCompletion.findMany({
    where: {
      habit: { userId },
      habitId: { in: [...habitIds] },
      completedDate: { gte: localDateToDbDate(addDays(today, -(HABIT_HISTORY_DAYS - 1))) },
    },
    select: { habitId: true, completedDate: true },
  });

  for (const row of rows) {
    const date = dbDateToLocalDate(row.completedDate);
    if (date) sets.get(row.habitId)?.add(date);
  }
  return sets;
}

function toDayView(
  row: HabitRow,
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  date: LocalDate,
  today: LocalDate,
): HabitDayView {
  return {
    ...toView(row, schedule, today),
    date,
    due: isHabitScheduledOnDate(schedule, date),
    completed: completions.has(date),
    streaks: computeHabitStreaks(schedule, completions, today),
    weekly:
      row.frequency === "WEEKLY" ? weeklyProgress(schedule, completions, date) : null,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface HabitListFilters {
  readonly status: HabitStatusFilter;
  readonly search: string | null;
}

export async function getHabits(
  userId: string,
  timezone: string,
  filters: HabitListFilters,
  now: Date = new Date(),
): Promise<HabitSummaryView[]> {
  const today = getLocalToday(timezone, now);

  const rows = await prisma.habit.findMany({
    where: {
      userId,
      ...(filters.status === "ALL" ? {} : { status: filters.status }),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    select: HABIT_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_HABITS,
  });

  const completions = await loadCompletionSets(
    userId,
    rows.map((row) => row.id),
    today,
  );

  const views = rows.map((row) => {
    const schedule = toSchedule(row);
    const done = completions.get(row.id) ?? new Set<LocalDate>();
    return {
      ...toDayView(row, schedule, done, today, today),
      rate30: completionRate(schedule, done, addDays(today, -29), today, today),
    };
  });

  return views.sort(compareHabitsForDay);
}

export async function getHabitStatusCounts(userId: string): Promise<Record<HabitStatusFilter, number>> {
  const groups = await prisma.habit.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  const counts: Record<HabitStatusFilter, number> = { ACTIVE: 0, PAUSED: 0, ARCHIVED: 0, ALL: 0 };
  for (const group of groups) {
    counts[group.status] = group._count._all;
    counts.ALL += group._count._all;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

/**
 * The habits that belong to one day — for Today and the dashboard.
 *
 * Active and paused habits are considered, and the schedule decides whether
 * each is due on `date`: a paused habit was still due on days before its
 * pause, which matters when the day being viewed is in the past. Archived
 * habits are left out — they have no days any more.
 */
export async function getHabitsForDay(
  userId: string,
  date: LocalDate,
  today: LocalDate,
): Promise<HabitDayView[]> {
  const rows = await prisma.habit.findMany({
    where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
    select: HABIT_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_HABITS,
  });

  const completions = await loadCompletionSets(
    userId,
    rows.map((row) => row.id),
    today,
  );

  return rows
    .map((row) => {
      const schedule = toSchedule(row);
      return toDayView(row, schedule, completions.get(row.id) ?? new Set(), date, today);
    })
    .filter((habit) => habit.due || habit.completed)
    .sort(compareHabitsForDay);
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface HabitHistoryWeek {
  readonly start: LocalDate;
  readonly days: readonly { readonly date: LocalDate; readonly state: DayState }[];
}

export interface HabitDetail extends HabitDayView {
  readonly rate30: CompletionRate;
  readonly rateAll: CompletionRate;
  /** Oldest week first, so the grid reads left to right, top to bottom. */
  readonly history: readonly HabitHistoryWeek[];
  readonly recent: readonly { readonly date: LocalDate; readonly completedAt: string }[];
  readonly completionCount: number;
}

export async function getHabitDetail(
  userId: string,
  habitId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<HabitDetail | null> {
  const today = getLocalToday(timezone, now);

  const row = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    select: HABIT_SELECT,
  });
  if (!row) return null;

  const schedule = toSchedule(row);

  const [completions, recentRows, completionCount] = await Promise.all([
    loadCompletionSets(userId, [row.id], today),
    prisma.habitCompletion.findMany({
      where: { habitId: row.id, habit: { userId } },
      select: { completedDate: true, completedAt: true },
      orderBy: [{ completedDate: "desc" }, { id: "desc" }],
      take: RECENT_COMPLETIONS_LIMIT,
    }),
    // The lifetime count comes from the database, not from the window.
    prisma.habitCompletion.count({ where: { habitId: row.id, habit: { userId } } }),
  ]);

  const done = completions.get(row.id) ?? new Set<LocalDate>();

  // Whole weeks, counted back from the week today falls in, so the grid is
  // always exactly HISTORY_GRID_WEEKS columns wide whatever weekday it is.
  const gridStart = addDays(startOfWeek(today), -(HISTORY_GRID_WEEKS - 1) * 7);
  const history: HabitHistoryWeek[] = [];
  for (let week = gridStart; week <= today; week = addDays(week, 7)) {
    history.push({
      start: week,
      days: getWeekDays(week).map((date) => ({
        date,
        state: dayState(schedule, done, date, today),
      })),
    });
  }

  return {
    ...toDayView(row, schedule, done, today, today),
    rate30: completionRate(schedule, done, addDays(today, -29), today, today),
    rateAll: completionRate(
      schedule,
      done,
      addDays(today, -(HABIT_HISTORY_DAYS - 1)),
      today,
      today,
    ),
    history,
    recent: recentRows.map((entry) => ({
      date: dbDateToLocalDate(entry.completedDate) as LocalDate,
      completedAt: entry.completedAt.toISOString(),
    })),
    completionCount,
  };
}
