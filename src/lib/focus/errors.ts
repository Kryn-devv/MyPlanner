import type { TransitionRefusal } from "./machine";

/**
 * Focus-specific failures.
 *
 * Ownership and existence failures deliberately reuse `NotFoundError` from the
 * auth guard: a session belonging to somebody else must be indistinguishable
 * from one that never existed, exactly as tasks, projects and goals already
 * behave. These two are the cases that are genuinely about focus.
 */

/** A live session already exists, so a second one was refused. */
export class ActiveSessionConflictError extends Error {
  readonly activeSessionId: string;
  readonly activeTaskTitle: string | null;

  constructor(activeSessionId: string, activeTaskTitle: string | null) {
    super(
      activeTaskTitle
        ? `You are already focusing on “${activeTaskTitle}”.`
        : "You already have a focus session running.",
    );
    this.name = "ActiveSessionConflictError";
    this.activeSessionId = activeSessionId;
    this.activeTaskTitle = activeTaskTitle;
  }
}

/** The session is not in a state that allows what was asked. */
export class InvalidTransitionError extends Error {
  readonly reason: TransitionRefusal;

  constructor(reason: TransitionRefusal) {
    super(
      reason === "already-finished"
        ? "That focus session has already finished."
        : "That focus session is not in a state where this is possible.",
    );
    this.name = "InvalidTransitionError";
    this.reason = reason;
  }
}
