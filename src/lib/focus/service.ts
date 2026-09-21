import "server-only";

import { MAX_TARGET_MINUTES, MIN_TARGET_MINUTES } from "@/config/focus";
import type { FocusSessionStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { elapsedSeconds, isTrackable } from "./duration";
import { ActiveSessionConflictError, InvalidTransitionError } from "./errors";
import { ACTIVE_STATUSES, canTransition, describeRefusal } from "./machine";

/**
 * Focus session writes.
 *
 * Two rules run through every function here.
 *
 * **The client never states a duration.** It can ask to start, pause, resume,
 * complete or cancel; the elapsed figure is always computed on this side from
 * timestamps this side wrote. There is no code path that accepts a number of
 * seconds from a request.
 *
 * **Every transition is a compare-and-swap.** The `UPDATE` carries the status
 * it expects to find in its `WHERE`, so two racing requests resolve in the
 * database rather than in application logic: one changes a row, the other
 * changes none and is told why. That is the same pattern task completion uses
 * to make double XP impossible.
 */

/** What a caller may choose when starting. Everything else is server-owned. */
export interface StartFocusInput {
  readonly taskId: string;
  /** The intended length. Optional — a session without one is valid. */
  readonly targetMinutes?: number | null;
}

const SESSION_SELECT = {
  id: true,
  status: true,
  accumulatedSeconds: true,
  segmentStartedAt: true,
  startedAt: true,
  endedAt: true,
  targetMinutes: true,
  taskId: true,
} as const;

type SessionRow = {
  id: string;
  status: FocusSessionStatus;
  accumulatedSeconds: number;
  segmentStartedAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  targetMinutes: number | null;
  taskId: string | null;
};

/** The shape the pure duration helpers expect. */
function toTiming(row: SessionRow) {
  return {
    status: row.status,
    accumulatedSeconds: row.accumulatedSeconds,
    segmentStartedAt: row.segmentStartedAt ? row.segmentStartedAt.toISOString() : null,
  };
}

/** Clamps a requested target, or drops it. Never trusted as given. */
function normalizeTarget(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const minutes = Math.floor(value);
  if (minutes < MIN_TARGET_MINUTES) return null;
  return Math.min(minutes, MAX_TARGET_MINUTES);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Loads the user's live session, or null. Used for conflict reporting. */
async function findActive(userId: string): Promise<{ id: string; title: string | null } | null> {
  const row = await prisma.focusSession.findFirst({
    where: { userId, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true, task: { select: { title: true } } },
  });
  if (!row) return null;
  return { id: row.id, title: row.task?.title ?? null };
}

/**
 * Starts a session on one of the caller's own tasks.
 *
 * The task is looked up scoped by `userId`, so that lookup *is* the
 * authorisation check: another user's task is simply not found, which is also
 * what a non-existent id gives, so task ids stay un-enumerable.
 *
 * Only one live session per user is allowed, and that is enforced by a partial
 * unique index rather than by checking first — between a check and an insert,
 * a concurrent request commits. The loser of that race is told which session
 * it collided with and never silently cancels it.
 */
export async function startFocusSession(
  userId: string,
  input: StartFocusInput,
  now: Date = new Date(),
): Promise<SessionRow> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("That task could not be found.");

  try {
    return await prisma.focusSession.create({
      data: {
        userId,
        taskId: task.id,
        status: "RUNNING",
        targetMinutes: normalizeTarget(input.targetMinutes),
        accumulatedSeconds: 0,
        // The clock starts here, on the server, and nowhere else.
        segmentStartedAt: now,
        startedAt: now,
      },
      select: SESSION_SELECT,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const active = await findActive(userId);
    // The index fired, so there is one; the fallback keeps this total.
    throw new ActiveSessionConflictError(active?.id ?? "", active?.title ?? null);
  }
}

/**
 * Applies a transition, banking elapsed time where the transition ends a
 * running segment.
 *
 * Read, check, then compare-and-swap inside one transaction. The read gives a
 * useful error for an impossible request; the swap is what actually decides a
 * race, because it names the status it expects. A request that loses changes
 * no rows and is reported as a state conflict rather than succeeding silently.
 */
async function transition(
  userId: string,
  sessionId: string,
  to: FocusSessionStatus,
  now: Date,
): Promise<SessionRow> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.focusSession.findFirst({
      where: { id: sessionId, userId },
      select: SESSION_SELECT,
    });
    if (!session) throw new NotFoundError("That focus session could not be found.");

    const refusal = describeRefusal(session.status, to);
    if (refusal) throw new InvalidTransitionError(refusal);

    const from = session.status;
    const elapsed = elapsedSeconds(toTiming(session), now);

    const data =
      to === "RUNNING"
        ? // Resuming opens a new segment; nothing is banked, because the
          // paused session had no segment in flight to bank.
          { status: to, segmentStartedAt: now, endedAt: null }
        : to === "PAUSED"
          ? { status: to, accumulatedSeconds: elapsed, segmentStartedAt: null }
          : // Completing or cancelling banks the final figure and stops the
            // clock for good.
            { status: to, accumulatedSeconds: elapsed, segmentStartedAt: null, endedAt: now };

    const swap = await tx.focusSession.updateMany({
      // The expected status in the WHERE is what makes this safe under
      // concurrency: a second request finds the row already moved on.
      where: { id: sessionId, userId, status: from },
      data,
    });

    if (swap.count === 0) {
      // Something else transitioned it between the read and the write.
      const current = await tx.focusSession.findFirst({
        where: { id: sessionId, userId },
        select: { status: true },
      });
      throw new InvalidTransitionError(
        current && canTransition(current.status, to) ? "wrong-state" : "already-finished",
      );
    }

    const updated = await tx.focusSession.findFirstOrThrow({
      where: { id: sessionId, userId },
      select: SESSION_SELECT,
    });
    return updated;
  });
}

export async function pauseFocusSession(
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<SessionRow> {
  return transition(userId, sessionId, "PAUSED", now);
}

export async function resumeFocusSession(
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<SessionRow> {
  return transition(userId, sessionId, "RUNNING", now);
}

export interface FocusCompletionOutcome {
  readonly sessionId: string;
  readonly trackedSeconds: number;
  /** True when the session was too short to record and was cancelled instead. */
  readonly discarded: boolean;
  readonly taskId: string | null;
}

/**
 * Ends a session and banks its final duration.
 *
 * A session shorter than the mis-click threshold is recorded as CANCELLED
 * rather than COMPLETED: the row is kept, because it happened, but it does not
 * count towards focused time. The caller is told, so the UI can say the
 * session was too short instead of implying it was saved.
 */
export async function completeFocusSession(
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<FocusCompletionOutcome> {
  const preview = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId },
    select: SESSION_SELECT,
  });
  if (!preview) throw new NotFoundError("That focus session could not be found.");

  const projected = elapsedSeconds(toTiming(preview), now);
  const keep = isTrackable(projected);

  const session = await transition(userId, sessionId, keep ? "COMPLETED" : "CANCELLED", now);

  return {
    sessionId: session.id,
    trackedSeconds: keep ? session.accumulatedSeconds : 0,
    discarded: !keep,
    taskId: session.taskId,
  };
}

/**
 * Abandons a session.
 *
 * The row survives with its elapsed time banked — it is a true record of a
 * period that happened — and simply never counts as focused work. Deleting it
 * would throw away the fact, and no XP is involved either way.
 */
export async function cancelFocusSession(
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<SessionRow> {
  return transition(userId, sessionId, "CANCELLED", now);
}

/**
 * Cancels the live session and starts a new one, atomically.
 *
 * Never implicit: this only runs when the user has been shown what is
 * currently in focus and has chosen to leave it. Doing both in one transaction
 * is what stops a crash between the two steps leaving nothing running, or the
 * unique index rejecting the new session because the old one is still live.
 */
export async function switchFocusSession(
  userId: string,
  fromSessionId: string,
  input: StartFocusInput,
  now: Date = new Date(),
): Promise<SessionRow> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId },
    select: { id: true },
  });
  if (!task) throw new NotFoundError("That task could not be found.");

  return prisma.$transaction(async (tx) => {
    const current = await tx.focusSession.findFirst({
      where: { id: fromSessionId, userId },
      select: SESSION_SELECT,
    });
    if (!current) throw new NotFoundError("That focus session could not be found.");

    const refusal = describeRefusal(current.status, "CANCELLED");
    if (refusal) throw new InvalidTransitionError(refusal);

    const swap = await tx.focusSession.updateMany({
      where: { id: fromSessionId, userId, status: current.status },
      data: {
        status: "CANCELLED",
        accumulatedSeconds: elapsedSeconds(toTiming(current), now),
        segmentStartedAt: null,
        endedAt: now,
      },
    });
    if (swap.count === 0) throw new InvalidTransitionError("wrong-state");

    // The old row left the partial index when it was cancelled above, so this
    // insert cannot collide with it.
    return tx.focusSession.create({
      data: {
        userId,
        taskId: task.id,
        status: "RUNNING",
        targetMinutes: normalizeTarget(input.targetMinutes),
        accumulatedSeconds: 0,
        segmentStartedAt: now,
        startedAt: now,
      },
      select: SESSION_SELECT,
    });
  });
}
