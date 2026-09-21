import type { FocusSessionStatus } from "@/generated/prisma/enums";

/**
 * The focus session state machine.
 *
 * Four states, one of which a session is always in, and an explicit table of
 * what may follow what. The alternative — `isRunning`, `isPaused`, `isDone`
 * booleans — can express "running and completed", and every read then has to
 * decide which flag wins. Here that state cannot be written down.
 *
 *     RUNNING  ⇄  PAUSED
 *        ↓         ↓
 *     COMPLETED / CANCELLED   (terminal)
 *
 * Terminal means terminal: a completed session never runs again. Finishing
 * more work is a new session, which is also the honest record of what
 * happened.
 */
export const FOCUS_TRANSITIONS: Record<FocusSessionStatus, readonly FocusSessionStatus[]> = {
  RUNNING: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["RUNNING", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: FocusSessionStatus, to: FocusSessionStatus): boolean {
  return FOCUS_TRANSITIONS[from].includes(to);
}

/** Live: the session is the user's current one, whether or not its clock runs. */
export function isActiveStatus(status: FocusSessionStatus): boolean {
  return status === "RUNNING" || status === "PAUSED";
}

/** Finished, one way or the other. Nothing further can happen to it. */
export function isTerminalStatus(status: FocusSessionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

/** The statuses that count as active, for `where` clauses and the index. */
export const ACTIVE_STATUSES: readonly FocusSessionStatus[] = ["RUNNING", "PAUSED"];

/** Only completed sessions are focused time. Cancelled ones never count. */
export const COUNTED_STATUSES: readonly FocusSessionStatus[] = ["COMPLETED"];

/** Why a transition was refused — the caller turns this into a message. */
export type TransitionRefusal = "already-finished" | "wrong-state";

export function describeRefusal(
  from: FocusSessionStatus,
  to: FocusSessionStatus,
): TransitionRefusal | null {
  if (canTransition(from, to)) return null;
  return isTerminalStatus(from) ? "already-finished" : "wrong-state";
}
