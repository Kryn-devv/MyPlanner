import { HABIT_HISTORY_DAYS } from "@/config/habits";
import type { HabitFrequency } from "@/generated/prisma/enums";
import { addDays, daysBetween, partsOf, type LocalDate } from "@/lib/datetime";
import { endOfWeek, startOfWeek } from "@/lib/calendar/range";

/**
 * The rules behind habits: what is due when, and what a streak is.
 *
 * Everything here is pure. It takes a schedule, a set of completion dates and
 * a "today", and gives back answers — no clock is read and no database is
 * touched. That is what makes a streak deterministic: the same history reads
 * the same way whenever you look at it.
 *
 * Two ideas the rest of the module leans on:
 *
 *  - **An occurrence is a scheduled day.** A day the habit is not due —
 *    a Tuesday for a Mon/Wed/Fri habit, any day inside a pause, any day before
 *    the start — is not a miss. It is simply not an occurrence, and the streak
 *    steps over it.
 *  - **Today is still open.** A scheduled day that has not been completed yet
 *    does not break anything until it is over, exactly as the task streak
 *    shows yesterday's run at 09:00 rather than a zero.
 */

/** The schedule a habit's rows describe, in the shape the rules need. */
export interface HabitSchedule {
  readonly frequency: HabitFrequency;
  /** 0 = Sunday … 6 = Saturday. Used by WEEKDAYS only. */
  readonly weekdays: readonly number[];
  /** Completions wanted per Monday–Sunday week. Used by WEEKLY only. */
  readonly weeklyTarget: number | null;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
  /** Paused periods, inclusive at both ends. `end` null means still paused. */
  readonly pauses: readonly { readonly start: LocalDate; readonly end: LocalDate | null }[];
}

/** True when `date` falls inside one of the schedule's pauses. */
export function isPausedOn(schedule: HabitSchedule, date: LocalDate): boolean {
  return schedule.pauses.some(
    (pause) => date >= pause.start && (pause.end === null || date <= pause.end),
  );
}

/** True when `date` lies within [startDate, endDate] and outside every pause. */
export function isAvailableOn(schedule: HabitSchedule, date: LocalDate): boolean {
  if (date < schedule.startDate) return false;
  if (schedule.endDate !== null && date > schedule.endDate) return false;
  return !isPausedOn(schedule, date);
}

/**
 * Whether the habit is due on `date`.
 *
 * For a WEEKLY habit this is "may be done on this day": any available day of
 * the week qualifies, because the target is per week, not per day.
 */
export function isHabitScheduledOnDate(schedule: HabitSchedule, date: LocalDate): boolean {
  if (!isAvailableOn(schedule, date)) return false;

  switch (schedule.frequency) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return schedule.weekdays.includes(partsOf(date).weekday);
    case "WEEKLY":
      return true;
  }
}

/**
 * Whether completing on `date` counts towards the habit.
 *
 * Same as being scheduled for DAILY and WEEKDAYS; for WEEKLY it is any
 * available day. Split out so the name says what the caller means.
 */
export function canCompleteOn(schedule: HabitSchedule, date: LocalDate): boolean {
  return isHabitScheduledOnDate(schedule, date);
}

/** The Monday–Sunday week containing `date`, inclusive. */
export function weekOf(date: LocalDate): { readonly start: LocalDate; readonly end: LocalDate } {
  return { start: startOfWeek(date), end: endOfWeek(date) };
}

/** Completions in the week containing `date`, and how many the week wants. */
export function weeklyProgress(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  date: LocalDate,
): { readonly done: number; readonly target: number } {
  const { start, end } = weekOf(date);
  let done = 0;
  for (const completed of completions) {
    if (completed >= start && completed <= end) done += 1;
  }
  return { done, target: schedule.weeklyTarget ?? 1 };
}

/**
 * Whether a week counts as kept, and whether it counts at all.
 *
 * A week is *in scope* when at least one of its days is available — a week
 * spent entirely paused, or before the habit began, is neither kept nor
 * missed. A week in scope is *kept* when its completions reach the target.
 */
function weekOutcome(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  weekStart: LocalDate,
): "kept" | "missed" | "out-of-scope" {
  const weekEnd = addDays(weekStart, 6);
  let available = false;
  for (let day = weekStart; day <= weekEnd; day = addDays(day, 1)) {
    if (isAvailableOn(schedule, day)) {
      available = true;
      break;
    }
  }
  if (!available) return "out-of-scope";

  const { done, target } = weeklyProgress(schedule, completions, weekStart);
  return done >= target ? "kept" : "missed";
}

export interface HabitStreaks {
  readonly current: number;
  readonly longest: number;
  /**
   * True when the streak arithmetic hit the history window before it hit a
   * gap — the real figure is at least this large and may be larger.
   */
  readonly currentClipped: boolean;
}

/**
 * Current and longest streaks as of `today`.
 *
 * Occurrence habits (DAILY, WEEKDAYS) count consecutive completed occurrences;
 * WEEKLY habits count consecutive kept weeks. In both cases the unit still in
 * progress — today, or the current week — is neutral until it is over: it adds
 * to the streak once done and breaks nothing until then.
 *
 * `completions` should hold the completion dates within the history window;
 * the walk stops at the window edge, at the habit's start, or at the first
 * gap, whichever comes first.
 */
export function computeHabitStreaks(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  today: LocalDate,
): HabitStreaks {
  return schedule.frequency === "WEEKLY"
    ? computeWeeklyStreaks(schedule, completions, today)
    : computeOccurrenceStreaks(schedule, completions, today);
}

function computeOccurrenceStreaks(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  today: LocalDate,
): HabitStreaks {
  const windowStart = addDays(today, -(HABIT_HISTORY_DAYS - 1));
  const floor = schedule.startDate > windowStart ? schedule.startDate : windowStart;
  // A habit that ended is judged as of its last day, not as of today.
  const ceiling = schedule.endDate !== null && schedule.endDate < today ? schedule.endDate : today;

  // -- current: walk backwards from the ceiling to the first gap -------------
  let current = 0;
  let currentClipped = false;
  for (let day = ceiling; day >= floor; day = addDays(day, -1)) {
    if (!isHabitScheduledOnDate(schedule, day)) continue;
    if (completions.has(day)) {
      current += 1;
    } else if (day === today) {
      // Still open — not a miss yet, and not a completion either.
      continue;
    } else {
      break;
    }
    if (day === floor && floor === windowStart) currentClipped = true;
  }

  // -- longest: walk forwards, tracking the best run ------------------------
  let longest = 0;
  let run = 0;
  for (let day = floor; day <= ceiling; day = addDays(day, 1)) {
    if (!isHabitScheduledOnDate(schedule, day)) continue;
    if (completions.has(day)) {
      run += 1;
      if (run > longest) longest = run;
    } else if (day !== today) {
      run = 0;
    }
  }

  return { current, longest: Math.max(longest, current), currentClipped };
}

function computeWeeklyStreaks(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  today: LocalDate,
): HabitStreaks {
  const windowStart = startOfWeek(addDays(today, -(HABIT_HISTORY_DAYS - 1)));
  const startWeek = startOfWeek(schedule.startDate);
  const floor = startWeek > windowStart ? startWeek : windowStart;
  const lastDay = schedule.endDate !== null && schedule.endDate < today ? schedule.endDate : today;
  const ceiling = startOfWeek(lastDay);

  // -- current ---------------------------------------------------------------
  let current = 0;
  let currentClipped = false;
  for (let week = ceiling; week >= floor; week = addDays(week, -7)) {
    const outcome = weekOutcome(schedule, completions, week);
    if (outcome === "out-of-scope") continue;
    if (outcome === "kept") {
      current += 1;
    } else if (week === ceiling && lastDay === today) {
      // The current week is still in progress: neutral, not a miss.
      continue;
    } else {
      break;
    }
    if (week === floor && floor === windowStart) currentClipped = true;
  }

  // -- longest ---------------------------------------------------------------
  let longest = 0;
  let run = 0;
  for (let week = floor; week <= ceiling; week = addDays(week, 7)) {
    const outcome = weekOutcome(schedule, completions, week);
    if (outcome === "out-of-scope") continue;
    if (outcome === "kept") {
      run += 1;
      if (run > longest) longest = run;
    } else if (!(week === ceiling && lastDay === today)) {
      run = 0;
    }
  }

  return { current, longest: Math.max(longest, current), currentClipped };
}

export interface CompletionRate {
  /** Occurrences that were due in the range, excluding today if still open. */
  readonly scheduled: number;
  readonly completed: number;
  /** Whole percent; 0 when nothing was due. */
  readonly percent: number;
}

/**
 * How much of what was due in `[from, to]` got done.
 *
 * For WEEKLY habits the unit is the week: a kept week counts as done, and
 * the number due is the number of in-scope weeks. Today's open occurrence, or
 * the current week, is left out of the denominator so a morning does not
 * read as a failure.
 */
export function completionRate(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
): CompletionRate {
  let scheduled = 0;
  let completed = 0;

  if (schedule.frequency === "WEEKLY") {
    for (let week = startOfWeek(from); week <= to; week = addDays(week, 7)) {
      const outcome = weekOutcome(schedule, completions, week);
      if (outcome === "out-of-scope") continue;
      const inProgress = week === startOfWeek(today) && to >= today;
      if (outcome === "kept") {
        scheduled += 1;
        completed += 1;
      } else if (!inProgress) {
        scheduled += 1;
      }
    }
  } else {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!isHabitScheduledOnDate(schedule, day)) continue;
      if (completions.has(day)) {
        scheduled += 1;
        completed += 1;
      } else if (day !== today) {
        scheduled += 1;
      }
    }
  }

  return {
    scheduled,
    completed,
    percent: scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100),
  };
}

/** How the habit reads on one day, for a row or a grid cell. */
export type DayState = "completed" | "due" | "missed" | "not-scheduled" | "paused" | "before-start";

export function dayState(
  schedule: HabitSchedule,
  completions: ReadonlySet<LocalDate>,
  date: LocalDate,
  today: LocalDate,
): DayState {
  if (completions.has(date)) return "completed";
  if (date < schedule.startDate) return "before-start";
  if (isPausedOn(schedule, date)) return "paused";
  if (!isHabitScheduledOnDate(schedule, date)) return "not-scheduled";
  if (date >= today) return "due";
  // A WEEKLY habit's individual day is never "missed" — only its week is.
  if (schedule.frequency === "WEEKLY") return "not-scheduled";
  return "missed";
}

/** The number of days a pause has been open, for the paused-habit notice. */
export function pausedFor(schedule: HabitSchedule, today: LocalDate): number | null {
  const open = schedule.pauses.find((pause) => pause.end === null);
  return open ? Math.max(0, daysBetween(today, open.start)) : null;
}

/**
 * A stable order for habit lists: what is due and still open first, then done,
 * then everything not due today; names break ties so the order is total.
 */
export function compareHabitsForDay<T extends { name: string; id: string }>(
  a: T & { due: boolean; completed: boolean },
  b: T & { due: boolean; completed: boolean },
): number {
  const rank = (habit: { due: boolean; completed: boolean }) =>
    habit.due && !habit.completed ? 0 : habit.due && habit.completed ? 1 : 2;
  const delta = rank(a) - rank(b);
  if (delta !== 0) return delta;
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
