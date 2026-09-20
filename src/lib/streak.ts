import { addDays, daysBetween, type LocalDate } from "@/lib/datetime";

/**
 * Daily productivity streak.
 *
 * Rules
 * -----
 *  - A day counts once the user completes at least one task on it, measured on
 *    *their* calendar.
 *  - Streaks only ever change as a side effect of completing a task. Merely
 *    opening the app — from anywhere in the world — never mutates them, which
 *    is what stops travel from silently resetting progress.
 *  - Completing a second task on a day already counted is a no-op.
 *
 * These are pure functions over a snapshot so they can be tested exhaustively
 * without a database or a fake clock.
 */

export interface StreakState {
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly lastCompletedDate: LocalDate | null;
}

/** Recomputed state after a task is completed on `today`. */
export function applyCompletionToStreak(state: StreakState, today: LocalDate): StreakState {
  const { lastCompletedDate } = state;
  const longest = Math.max(0, state.longestStreak);

  // Already counted today.
  if (lastCompletedDate === today) {
    const current = Math.max(1, state.currentStreak);
    return { currentStreak: current, longestStreak: Math.max(longest, current), lastCompletedDate: today };
  }

  let currentStreak: number;
  if (lastCompletedDate && daysBetween(today, lastCompletedDate) === 1) {
    // Consecutive day — extend.
    currentStreak = Math.max(1, state.currentStreak) + 1;
  } else if (lastCompletedDate && daysBetween(today, lastCompletedDate) < 0) {
    // Back-dated completion (clock skew, or a timezone move westwards).
    // Never punish: keep the streak, keep the newer last-completed date.
    const current = Math.max(1, state.currentStreak);
    return { currentStreak: current, longestStreak: Math.max(longest, current), lastCompletedDate };
  } else {
    // First ever completion, or the chain was broken.
    currentStreak = 1;
  }

  return {
    currentStreak,
    longestStreak: Math.max(longest, currentStreak),
    lastCompletedDate: today,
  };
}

/**
 * The streak as it should be *displayed* today.
 *
 * A stored streak goes stale the moment a day passes without a completion, but
 * we deliberately do not rewrite the row on read — a page view is not an event.
 * Today and yesterday both still show the streak: the day is not over yet, so
 * showing "0" at 09:00 because you have not worked yet would be wrong.
 */
export function getDisplayStreak(state: StreakState, today: LocalDate): number {
  if (!state.lastCompletedDate) return 0;
  const gap = daysBetween(today, state.lastCompletedDate);
  if (gap < 0) return Math.max(0, state.currentStreak);
  return gap <= 1 ? Math.max(0, state.currentStreak) : 0;
}

/** True when the streak survives only if the user finishes something today. */
export function isStreakAtRisk(state: StreakState, today: LocalDate): boolean {
  if (!state.lastCompletedDate || state.currentStreak <= 0) return false;
  return daysBetween(today, state.lastCompletedDate) === 1;
}

/** The day the streak would break if nothing is completed. */
export function getStreakDeadline(state: StreakState): LocalDate | null {
  if (!state.lastCompletedDate) return null;
  return addDays(state.lastCompletedDate, 1);
}
