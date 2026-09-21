import "server-only";

import { TASK_HISTORY_LIMIT } from "@/config/focus";
import type { FocusSessionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { elapsedSeconds } from "./duration";
import { ACTIVE_STATUSES } from "./machine";

/**
 * Focus session reads.
 *
 * Totals come from database aggregates, never from loading sessions into
 * JavaScript to add them up — the same rule project, goal and day progress
 * already follow. Every query is scoped by `userId` in its WHERE clause and
 * bounded: the shell's "is anything running?" is one indexed row, and a task's
 * history is a capped list beside a full aggregate.
 */

/** Enough context to render the focus bar and the focus page. */
export interface ActiveFocusSession {
  readonly id: string;
  readonly status: FocusSessionStatus;
  /** Seconds banked so far. The client adds the live segment itself. */
  readonly accumulatedSeconds: number;
  /** ISO instant the running segment began; null while paused. */
  readonly segmentStartedAt: string | null;
  readonly startedAt: string;
  readonly targetMinutes: number | null;
  /**
   * Elapsed seconds as of this render, resolved with the server's clock.
   *
   * The browser recomputes from `accumulatedSeconds` and `segmentStartedAt`
   * every second; this exists so its *first* render agrees with the HTML the
   * server sent, rather than differing by the second that passed in between.
   */
  readonly elapsedSeconds: number;
  readonly task: ActiveFocusTask | null;
}

export interface ActiveFocusTask {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly estimatedMinutes: number | null;
  readonly project: { readonly id: string; readonly name: string; readonly color: string } | null;
  readonly milestone: { readonly id: string; readonly title: string } | null;
  readonly goal: { readonly id: string; readonly title: string } | null;
}

/**
 * The user's live session, if there is one.
 *
 * At most one row can match, because a partial unique index says so. The
 * hierarchy is reached through the task rather than stored on the session —
 * `FocusSession` has no project, milestone or goal column, because a second
 * path to the same fact is a second thing that can be wrong.
 */
export async function getActiveFocusSession(
  userId: string,
  now: Date = new Date(),
): Promise<ActiveFocusSession | null> {
  const row = await prisma.focusSession.findFirst({
    where: { userId, status: { in: [...ACTIVE_STATUSES] } },
    select: {
      id: true,
      status: true,
      accumulatedSeconds: true,
      segmentStartedAt: true,
      startedAt: true,
      targetMinutes: true,
      task: {
        select: {
          id: true,
          title: true,
          completed: true,
          estimatedMinutes: true,
          project: {
            select: {
              id: true,
              name: true,
              color: true,
              goal: { select: { id: true, title: true } },
            },
          },
          milestone: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!row) return null;

  const segmentStartedAt = row.segmentStartedAt ? row.segmentStartedAt.toISOString() : null;

  return {
    id: row.id,
    status: row.status,
    accumulatedSeconds: row.accumulatedSeconds,
    segmentStartedAt,
    startedAt: row.startedAt.toISOString(),
    targetMinutes: row.targetMinutes,
    elapsedSeconds: elapsedSeconds(
      { status: row.status, accumulatedSeconds: row.accumulatedSeconds, segmentStartedAt },
      now,
    ),
    task: row.task
      ? {
          id: row.task.id,
          title: row.task.title,
          completed: row.task.completed,
          estimatedMinutes: row.task.estimatedMinutes,
          project: row.task.project
            ? {
                id: row.task.project.id,
                name: row.task.project.name,
                color: row.task.project.color,
              }
            : null,
          milestone: row.task.milestone,
          goal: row.task.project?.goal ?? null,
        }
      : null,
  };
}

/** One finished session, as the history list shows it. */
export interface FocusHistoryEntry {
  readonly id: string;
  readonly seconds: number;
  readonly endedAt: string;
  readonly targetMinutes: number | null;
}

export interface TaskFocusHistory {
  /** Completed seconds only. Cancelled sessions are never focused time. */
  readonly totalSeconds: number;
  readonly sessionCount: number;
  readonly recent: readonly FocusHistoryEntry[];
  /** True when there are more completed sessions than `recent` shows. */
  readonly truncated: boolean;
}

/**
 * A task's focus record.
 *
 * Two queries: an aggregate for the totals and a capped list for the recent
 * ones. The aggregate is what makes the totals right regardless of how many
 * sessions exist, and the cap is what keeps the read bounded.
 *
 * Scoped by `userId` as well as `taskId`, so knowing a task id is not enough
 * to read somebody's focus history.
 */
export async function getTaskFocusHistory(
  userId: string,
  taskId: string,
): Promise<TaskFocusHistory> {
  const where = { userId, taskId, status: "COMPLETED" as const };

  const [totals, recent] = await Promise.all([
    prisma.focusSession.aggregate({
      where,
      _sum: { accumulatedSeconds: true },
      _count: { _all: true },
    }),
    prisma.focusSession.findMany({
      where,
      select: { id: true, accumulatedSeconds: true, endedAt: true, targetMinutes: true },
      // Newest first, with the id breaking ties so a capped list is the same
      // list on every render.
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
      take: TASK_HISTORY_LIMIT,
    }),
  ]);

  const sessionCount = totals._count._all;

  return {
    totalSeconds: totals._sum.accumulatedSeconds ?? 0,
    sessionCount,
    recent: recent
      .filter((entry): entry is typeof entry & { endedAt: Date } => entry.endedAt !== null)
      .map((entry) => ({
        id: entry.id,
        seconds: entry.accumulatedSeconds,
        endedAt: entry.endedAt.toISOString(),
        targetMinutes: entry.targetMinutes,
      })),
    truncated: sessionCount > recent.length,
  };
}

/**
 * Completed focus seconds for several tasks at once.
 *
 * One grouped aggregate rather than a query per task — a list of twenty tasks
 * must not become twenty round trips. Returns a map so callers can look up a
 * task without scanning.
 */
export async function getFocusSecondsByTask(
  userId: string,
  taskIds: readonly string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();

  const rows = await prisma.focusSession.groupBy({
    by: ["taskId"],
    where: { userId, status: "COMPLETED", taskId: { in: [...taskIds] } },
    _sum: { accumulatedSeconds: true },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.taskId === null) continue;
    totals.set(row.taskId, row._sum.accumulatedSeconds ?? 0);
  }
  return totals;
}

/**
 * Completed focus seconds inside a window — what a day actually tracked.
 *
 * Bounded by the window and answered by the database. The window is a pair of
 * instants, not a calendar day: the caller resolves the user's day through the
 * existing date layer and passes the boundaries in.
 */
export async function getTrackedFocusSeconds(
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await prisma.focusSession.aggregate({
    where: { userId, status: "COMPLETED", endedAt: { gte: from, lt: to } },
    _sum: { accumulatedSeconds: true },
  });
  return result._sum.accumulatedSeconds ?? 0;
}
