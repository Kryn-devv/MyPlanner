import { MIN_TRACKED_SECONDS } from "@/config/focus";
import type { FocusSessionStatus } from "@/generated/prisma/enums";

/**
 * Elapsed-time arithmetic.
 *
 * Every function here is pure and derives duration from timestamps the server
 * wrote. Nothing counts upwards, and nothing accepts a duration from a caller:
 * a browser can ask to pause a session, it can never state how long one ran.
 *
 * That is also what makes the timer survive everything. A refresh, a
 * navigation, a sleeping laptop, a closed browser — none of them is where the
 * time was being kept, so none of them can lose it.
 *
 * Durations are intervals, not calendar days, so they are computed from
 * absolute instants and never touch a timezone. Twenty-five minutes is
 * twenty-five minutes across midnight, across a DST boundary, and on a plane.
 */

/** The three fields any elapsed calculation needs. */
export interface FocusTiming {
  readonly status: FocusSessionStatus;
  /** Seconds banked by segments that have already ended. */
  readonly accumulatedSeconds: number;
  /** ISO instant the current running segment began; null when not running. */
  readonly segmentStartedAt: string | null;
}

const MS_PER_SECOND = 1000;

/**
 * Seconds of focus as of `now`.
 *
 * A running session adds the segment in flight; anything else is exactly what
 * has been banked. The segment is floored to whole seconds and clamped at
 * zero, so a clock that steps backwards can never make elapsed time shrink.
 */
export function elapsedSeconds(timing: FocusTiming, now: Date): number {
  const banked = Math.max(0, Math.floor(timing.accumulatedSeconds));

  if (timing.status !== "RUNNING" || timing.segmentStartedAt === null) return banked;

  const startedAt = Date.parse(timing.segmentStartedAt);
  if (Number.isNaN(startedAt)) return banked;

  const segment = Math.floor((now.getTime() - startedAt) / MS_PER_SECOND);
  return banked + Math.max(0, segment);
}

/** Seconds the in-flight segment has run; zero when the clock is not moving. */
export function currentSegmentSeconds(timing: FocusTiming, now: Date): number {
  return elapsedSeconds(timing, now) - Math.max(0, Math.floor(timing.accumulatedSeconds));
}

/** `"18:42"`, or `"1:05:03"` once a session passes an hour. */
export function formatTimer(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(secs).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * `"56 min"`, `"1h 35m"` — for totals rather than a live clock.
 *
 * Deliberately not `formatDuration` from the date layer: that one takes
 * minutes and is used for estimates. Rounding seconds to minutes here, once,
 * keeps "tracked focus" and "estimated" reading in the same units.
 */
export function formatTrackedTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (total === 0) return "0m";
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export interface TargetProgress {
  readonly targetSeconds: number;
  /** 0–100, clamped for the bar. `reached` is what says you got there. */
  readonly percent: number;
  readonly reached: boolean;
  /** Seconds worked beyond the target. Zero until it is passed. */
  readonly overrunSeconds: number;
  readonly remainingSeconds: number;
}

/**
 * Progress towards an intended length.
 *
 * A target is a goal, never a limit: passing it neither stops the session nor
 * caps the figure. The bar fills to 100% and the elapsed time keeps climbing,
 * because 31 minutes of work is 31 minutes whatever was planned.
 */
export function targetProgress(
  elapsed: number,
  targetMinutes: number | null,
): TargetProgress | null {
  if (targetMinutes === null || !Number.isFinite(targetMinutes) || targetMinutes <= 0) return null;

  const targetSeconds = Math.floor(targetMinutes) * 60;
  const worked = Math.max(0, Math.floor(elapsed));

  return {
    targetSeconds,
    percent: Math.min(100, Math.round((worked / targetSeconds) * 100)),
    reached: worked >= targetSeconds,
    overrunSeconds: Math.max(0, worked - targetSeconds),
    remainingSeconds: Math.max(0, targetSeconds - worked),
  };
}

/**
 * Whether a finished session is long enough to be worth recording.
 *
 * Below the threshold it was a mis-click, and letting it through would put
 * minutes of "focus" on the board that nobody worked.
 */
export function isTrackable(seconds: number): boolean {
  return Math.floor(seconds) >= MIN_TRACKED_SECONDS;
}
