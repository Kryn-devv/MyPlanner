/**
 * Focus presets and limits.
 *
 * In `src/config` because client components need these values and the focus
 * query layer is `server-only`. Nothing here describes stored data.
 */

export interface FocusPreset {
  readonly minutes: number;
  readonly label: string;
}

/**
 * Convenient lengths, not a methodology.
 *
 * This is a productivity workspace, not a Pomodoro app: 25 minutes is offered
 * because it is a common choice, not because the product has an opinion about
 * work/break cycles. A custom length is a first-class option, and a session
 * with no target at all is perfectly valid.
 */
export const FOCUS_PRESETS: readonly FocusPreset[] = [
  { minutes: 25, label: "25 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "60 min" },
  { minutes: 90, label: "90 min" },
];

export const DEFAULT_TARGET_MINUTES = 25;

/** A target has to be a plausible sitting. Validated on the server too. */
export const MIN_TARGET_MINUTES = 1;
export const MAX_TARGET_MINUTES = 8 * 60;

/**
 * Below this, a "session" is a mis-click rather than work.
 *
 * Completing one anyway would let an accidental double tap inflate tracked
 * focus, and tracked focus is only worth anything if it is honest. A session
 * finished under this threshold is recorded as CANCELLED instead — the row is
 * kept, it simply does not count. The UI says so rather than pretending the
 * session was saved.
 */
export const MIN_TRACKED_SECONDS = 10;

/**
 * How old a live session has to be before the page checks in about it.
 *
 * Nothing is auto-cancelled: an eight-hour session may be exactly right, and
 * silently discarding someone's data to tidy up a number would be worse than
 * showing a large one. This only decides when to mention it.
 */
export const STALE_SESSION_HOURS = 6;

/** How many recent sessions a task's history shows before it stops listing. */
export const TASK_HISTORY_LIMIT = 5;
