import "server-only";

import { HABIT_HISTORY_DAYS } from "@/config/habits";
import type { HabitStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/auth/guard";
import {
  addDays,
  daysBetween,
  dbDateToLocalDate,
  getLocalToday,
  isLocalDate,
  localDateToDbDate,
  type LocalDate,
} from "@/lib/datetime";
import { calculateLevel } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import type { HabitInput } from "@/lib/validation/habit";
import { canCompleteOn, type HabitSchedule } from "./logic";

/**
 * Habit writes.
 *
 * Three rules hold throughout, and they are the same three the task and focus
 * services keep:
 *
 *  - **Ownership is in the WHERE clause.** Every read and write is scoped by
 *    `userId`, so a foreign habit is simply not found — the same answer a
 *    non-existent id gives, which keeps ids un-enumerable.
 *  - **The database decides races.** A completion is a row with a unique key;
 *    ten simultaneous requests produce one row, because nine lose on the index
 *    before any XP is written. Status changes and undo are compare-and-swaps
 *    that name the state they expect to find, and the cached XP total moves by
 *    an atomic increment rather than a stale read-add-write.
 *  - **XP goes through the existing ledger, once.** A completion writes one
 *    AWARD row on `XpTransaction` with `source: HABIT_COMPLETION` and updates
 *    the cached total exactly as task completion does. Nothing here touches
 *    `tasksCompleted`, `currentStreak`, `longestStreak` or `lastCompletedDate`
 *    — the global streak is a task-completion streak, and a habit has its own.
 */

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Why a completion or undo was refused — the action turns this into copy. */
export type HabitCompletionRefusal = "not-active" | "future" | "too-old" | "not-scheduled";

export class HabitCompletionError extends Error {
  readonly reason: HabitCompletionRefusal;

  constructor(reason: HabitCompletionRefusal) {
    super(
      {
        "not-active": "That habit is not active right now.",
        future: "You cannot complete a habit for a day that has not happened yet.",
        "too-old": "That day is too far back to record.",
        "not-scheduled": "That habit is not due on that day.",
      }[reason],
    );
    this.name = "HabitCompletionError";
    this.reason = reason;
  }
}

export class HabitStateError extends Error {
  constructor(message = "That habit cannot change to that state from where it is.") {
    super(message);
    this.name = "HabitStateError";
  }
}

const SCHEDULE_SELECT = {
  id: true,
  name: true,
  status: true,
  frequency: true,
  weekdays: true,
  weeklyTarget: true,
  xpReward: true,
  startDate: true,
  endDate: true,
  pauses: { select: { startDate: true, endDate: true } },
} as const;

type ScheduleRow = {
  frequency: HabitSchedule["frequency"];
  weekdays: number[];
  weeklyTarget: number | null;
  startDate: Date;
  endDate: Date | null;
  pauses: { startDate: Date; endDate: Date | null }[];
};

/** The row's dates as the pure rules read them. */
export function toSchedule(row: ScheduleRow): HabitSchedule {
  return {
    frequency: row.frequency,
    weekdays: row.weekdays,
    weeklyTarget: row.weeklyTarget,
    startDate: dbDateToLocalDate(row.startDate) as LocalDate,
    endDate: dbDateToLocalDate(row.endDate),
    pauses: row.pauses.map((pause) => ({
      start: dbDateToLocalDate(pause.startDate) as LocalDate,
      end: dbDateToLocalDate(pause.endDate),
    })),
  };
}

interface StatsSnapshot {
  totalXp: number;
  level: number;
}

/** Only the two columns habit XP is allowed to touch. */
async function readXpStats(tx: TxClient, userId: string): Promise<StatsSnapshot> {
  return tx.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { totalXp: true, level: true },
  });
}

/**
 * Moves the cached total by `delta` and re-derives the level from the result.
 *
 * An atomic `increment` rather than read-add-write: two habits ticked in the
 * same instant each add their own reward, where two stale reads would let one
 * overwrite the other and leave the cache short of the ledger. The row lock
 * the increment takes serialises the level write behind it.
 */
async function applyXpDelta(
  tx: TxClient,
  userId: string,
  delta: number,
): Promise<{ previousLevel: number; totalXp: number; level: number }> {
  const before = await readXpStats(tx, userId);
  // A zero-reward habit still records the day; it just has nothing to move,
  // and taking the stats row's write lock for a no-op would serialise ticks
  // across every habit for no reason.
  if (delta === 0) {
    return { previousLevel: before.level, totalXp: before.totalXp, level: before.level };
  }

  const moved = await tx.userStats.update({
    where: { userId },
    data: { totalXp: { increment: delta } },
    select: { totalXp: true },
  });
  const totalXp = Math.max(0, moved.totalXp);
  const level = calculateLevel(totalXp);
  await tx.userStats.update({ where: { userId }, data: { totalXp, level } });
  return { previousLevel: before.level, totalXp, level };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createHabit(userId: string, input: HabitInput): Promise<{ id: string }> {
  return prisma.habit.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      frequency: input.frequency,
      weekdays: [...input.weekdays],
      weeklyTarget: input.weeklyTarget,
      xpReward: input.xpReward,
      startDate: localDateToDbDate(input.startDate),
      endDate: input.endDate ? localDateToDbDate(input.endDate) : null,
    },
    select: { id: true },
  });
}

/**
 * Changes a habit's future. Its past is left exactly as it was.
 *
 * Completions are historical facts and are never rewritten: a habit switched
 * from daily to Mon/Wed/Fri keeps every Tuesday it ever completed. What
 * changes is what counts as *due* from here on, which is why streaks are
 * derived on read rather than cached — a cache would have been computed under
 * the old schedule.
 */
export async function updateHabit(userId: string, habitId: string, input: HabitInput): Promise<void> {
  const result = await prisma.habit.updateMany({
    where: { id: habitId, userId },
    data: {
      name: input.name,
      description: input.description,
      frequency: input.frequency,
      weekdays: [...input.weekdays],
      weeklyTarget: input.weeklyTarget,
      xpReward: input.xpReward,
      startDate: localDateToDbDate(input.startDate),
      endDate: input.endDate ? localDateToDbDate(input.endDate) : null,
    },
  });
  if (result.count === 0) throw new NotFoundError("That habit could not be found.");
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Legal moves. ARCHIVED → PAUSED is deliberately absent: an archived habit is
 * restored first, then paused, so the pause log never has to invent a start.
 */
const TRANSITIONS: Record<HabitStatus, readonly HabitStatus[]> = {
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};

/**
 * Moves a habit between ACTIVE, PAUSED and ARCHIVED, keeping the pause log in
 * step so streaks can tell an unavailable day from a missed one.
 *
 * Leaving ACTIVE opens a pause from `today`; returning to ACTIVE closes it at
 * yesterday. Archiving is recorded the same way, because for the streak
 * arithmetic an archived day and a paused day are the same thing: not an
 * occurrence. A pause opened and closed on the same day is deleted rather than
 * kept as an empty interval.
 */
export async function setHabitStatus(
  userId: string,
  habitId: string,
  target: HabitStatus,
  today: LocalDate,
  now: Date = new Date(),
): Promise<{ changed: boolean; status: HabitStatus }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.habit.findFirst({
      where: { id: habitId, userId },
      select: { status: true },
    });
    if (!current) throw new NotFoundError("That habit could not be found.");
    if (current.status === target) return { changed: false, status: target };
    if (!TRANSITIONS[current.status].includes(target)) throw new HabitStateError();

    // The expected status in the WHERE is what makes this safe under
    // concurrency: a second request finds the row already moved on.
    const swap = await tx.habit.updateMany({
      where: { id: habitId, userId, status: current.status },
      data: {
        status: target,
        archivedAt: target === "ARCHIVED" ? now : target === "ACTIVE" ? null : undefined,
      },
    });
    if (swap.count === 0) throw new HabitStateError();

    if (current.status === "ACTIVE") {
      // Becoming unavailable: open a pause from today.
      await tx.habitPause.create({
        data: { habitId, startDate: localDateToDbDate(today) },
      });
    } else if (target === "ACTIVE") {
      // Becoming available again: close the open pause at yesterday.
      const open = await tx.habitPause.findFirst({
        where: { habitId, endDate: null },
        select: { id: true, startDate: true },
      });
      if (open) {
        const yesterday = addDays(today, -1);
        const start = dbDateToLocalDate(open.startDate) as LocalDate;
        if (yesterday < start) {
          // Paused and resumed on the same day: nothing was ever unavailable.
          await tx.habitPause.delete({ where: { id: open.id } });
        } else {
          await tx.habitPause.update({
            where: { id: open.id },
            data: { endDate: localDateToDbDate(yesterday) },
          });
        }
      }
    }
    // PAUSED → ARCHIVED: the open pause simply stays open.

    return { changed: true, status: target };
  });
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export interface HabitCompletionOutcome {
  readonly habitId: string;
  readonly date: LocalDate;
  /** False when the occurrence was already in the target state — a no-op. */
  readonly changed: boolean;
  readonly xpDelta: number;
  readonly totalXp: number;
  readonly level: number;
  readonly previousLevel: number;
  readonly leveledUp: boolean;
}

/**
 * Records one completed occurrence and awards its XP exactly once.
 *
 * The completion row's unique key on (habitId, completedDate) is the guard:
 * of any number of concurrent requests, one inserts and the rest are told the
 * day was already done, without writing XP. The AWARD row is written only by
 * the request that inserted, and its own unique on (habitCompletionId, kind)
 * is belt and braces on top of that.
 *
 * Back-dating is allowed within the history window — "I did it yesterday and
 * forgot to tick it" is real — but never into the future, never before the
 * habit began, and never on a day it was not due.
 */
export async function completeHabit(
  userId: string,
  habitId: string,
  date: LocalDate,
  timezone: string,
  now: Date = new Date(),
): Promise<HabitCompletionOutcome> {
  const today = getLocalToday(timezone, now);
  if (!isLocalDate(date)) throw new HabitCompletionError("not-scheduled");

  return prisma.$transaction(async (tx) => {
    const habit = await tx.habit.findFirst({
      where: { id: habitId, userId },
      select: SCHEDULE_SELECT,
    });
    if (!habit) throw new NotFoundError("That habit could not be found.");

    if (habit.status !== "ACTIVE") throw new HabitCompletionError("not-active");
    if (date > today) throw new HabitCompletionError("future");
    if (daysBetween(today, date) >= HABIT_HISTORY_DAYS) throw new HabitCompletionError("too-old");
    if (!canCompleteOn(toSchedule(habit), date)) throw new HabitCompletionError("not-scheduled");

    // `INSERT … ON CONFLICT DO NOTHING`: a lost race yields zero rows rather
    // than a unique-violation error, which in PostgreSQL would abort the
    // transaction and take the stats read below down with it.
    const inserted = await tx.habitCompletion.createManyAndReturn({
      data: [{ habitId, completedDate: localDateToDbDate(date), completedAt: now }],
      skipDuplicates: true,
      select: { id: true },
    });

    if (inserted.length === 0) {
      // Someone — probably this same user, a moment ago — got here first.
      // Their transaction has committed by the time the insert returns, so
      // the totals read here already include their award.
      const stats = await readXpStats(tx, userId);
      return {
        habitId,
        date,
        changed: false,
        xpDelta: 0,
        totalXp: stats.totalXp,
        level: stats.level,
        previousLevel: stats.level,
        leveledUp: false,
      };
    }
    const completionId = (inserted[0] as { id: string }).id;

    // The reward is read from the stored row, never from the request.
    let xpDelta = 0;
    if (habit.xpReward > 0) {
      await tx.xpTransaction.create({
        data: {
          userId,
          habitCompletionId: completionId,
          amount: habit.xpReward,
          kind: "AWARD",
          source: "HABIT_COMPLETION",
          description: `Kept “${habit.name}” on ${date}`,
        },
      });
      xpDelta = habit.xpReward;
    }

    const { previousLevel, totalXp, level } = await applyXpDelta(tx, userId, xpDelta);

    return {
      habitId,
      date,
      changed: true,
      xpDelta,
      totalXp,
      level,
      previousLevel,
      leveledUp: level > previousLevel,
    };
  });
}

/**
 * Removes a completed occurrence and reverses exactly the XP it awarded.
 *
 * The delete is the compare-and-swap: two concurrent undos both find the row,
 * but only one delete reports a count of one, and only that request writes a
 * REVERSAL. The reversal amount is read from the AWARD row before the delete,
 * so raising a habit's reward later can never claw back more than was given.
 * The ledger rows survive the delete detached (`SetNull`), netting to zero.
 */
export async function undoHabitCompletion(
  userId: string,
  habitId: string,
  date: LocalDate,
  now: Date = new Date(),
): Promise<HabitCompletionOutcome> {
  if (!isLocalDate(date)) throw new HabitCompletionError("not-scheduled");

  return prisma.$transaction(async (tx) => {
    const habit = await tx.habit.findFirst({
      where: { id: habitId, userId },
      select: { id: true, name: true, status: true },
    });
    if (!habit) throw new NotFoundError("That habit could not be found.");
    if (habit.status !== "ACTIVE") throw new HabitCompletionError("not-active");

    const noOp = async (): Promise<HabitCompletionOutcome> => {
      const stats = await readXpStats(tx, userId);
      return {
        habitId,
        date,
        changed: false,
        xpDelta: 0,
        totalXp: stats.totalXp,
        level: stats.level,
        previousLevel: stats.level,
        leveledUp: false,
      };
    };

    const completion = await tx.habitCompletion.findFirst({
      where: { habitId, completedDate: localDateToDbDate(date) },
      select: { id: true },
    });
    if (!completion) return noOp();

    const award = await tx.xpTransaction.findFirst({
      where: { habitCompletionId: completion.id, kind: "AWARD" },
      select: { amount: true },
    });

    const deleted = await tx.habitCompletion.deleteMany({ where: { id: completion.id } });
    if (deleted.count === 0) return noOp();

    let xpDelta = 0;
    if (award && award.amount !== 0) {
      await tx.xpTransaction.create({
        data: {
          userId,
          // The completion is gone, so this cannot reference it; the delete
          // above is what guarantees this row is written once.
          habitCompletionId: null,
          amount: -award.amount,
          kind: "REVERSAL",
          source: "HABIT_COMPLETION",
          description: `Unticked “${habit.name}” for ${date}`,
        },
      });
      xpDelta = -award.amount;
    }

    const { previousLevel, totalXp, level } = await applyXpDelta(tx, userId, xpDelta);

    return {
      habitId,
      date,
      changed: true,
      xpDelta,
      totalXp,
      level,
      previousLevel,
      leveledUp: false,
    };
  });
}

/** Exposed for the completion action's copy: what today is for this user. */
export function todayFor(timezone: string, now: Date = new Date()): LocalDate {
  return getLocalToday(timezone, now);
}
