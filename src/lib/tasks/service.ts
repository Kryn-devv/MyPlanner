import "server-only";

import { NotFoundError } from "@/lib/auth/guard";
import { getLocalToday, localDateToDbDate, type LocalDate } from "@/lib/datetime";
import { calculateLevel } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import { applyCompletionToStreak } from "@/lib/streak";
import type { TaskInput } from "@/lib/validation/task";

/**
 * Task write operations.
 *
 * Every mutation here takes `userId` as its first argument and folds it into
 * the WHERE clause. There is no code path that loads a task by id alone, so a
 * forged id cannot reach another user's row.
 *
 * Completion is the delicate one. The invariants are:
 *
 *   1. A task can only transition false -> true once per completion cycle.
 *   2. Exactly one AWARD ledger row exists per cycle, and at most one REVERSAL.
 *   3. `UserStats.totalXp` always equals the sum of the user's ledger.
 *
 * (1) is enforced by a compare-and-swap: the UPDATE itself carries
 * `completed: false` in its WHERE, so two concurrent requests race in the
 * database and exactly one wins. (2) is enforced by a unique index on
 * (taskId, kind, cycle). (3) holds because the ledger row and the rollup are
 * written in the same transaction.
 *
 * Belt *and* braces is deliberate: application-level guards alone lose to a
 * double-click, and database constraints alone give poor error messages.
 */

export interface CompletionOutcome {
  readonly taskId: string;
  readonly title: string;
  /** False when the task was already in the target state — a harmless no-op. */
  readonly changed: boolean;
  /** Signed XP applied by this operation. */
  readonly xpDelta: number;
  readonly totalXp: number;
  readonly level: number;
  readonly previousLevel: number;
  readonly leveledUp: boolean;
  readonly currentStreak: number;
  readonly longestStreak: number;
}

/** Marks a task complete, awarding XP exactly once per completion cycle. */
export async function completeTask(
  userId: string,
  taskId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<CompletionOutcome> {
  const today = getLocalToday(timezone, now);

  return prisma.$transaction(async (tx) => {
    // Compare-and-swap. Scoped by userId, so this is also the authorisation check.
    const swap = await tx.task.updateMany({
      where: { id: taskId, userId, completed: false },
      data: { completed: true, completedAt: now, completionCount: { increment: 1 } },
    });

    const task = await tx.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true, title: true, xpReward: true, completionCount: true },
    });

    // Either it never existed or it belongs to somebody else — same answer, so
    // task ids are not enumerable.
    if (!task) throw new NotFoundError("That task could not be found.");

    const stats = await readStats(tx, userId);

    // Already complete: report current state, award nothing.
    if (swap.count === 0) {
      return noOpOutcome(task.id, task.title, stats);
    }

    const cycle = task.completionCount;
    const amount = task.xpReward;

    // The reward is read from the stored row, never from the request.
    const ledgerWritten = await writeLedgerEntry(tx, {
      userId,
      taskId: task.id,
      amount,
      kind: "AWARD",
      cycle,
      description: `Completed “${task.title}”`,
    });

    // If the unique index rejected the row, XP for this cycle already exists.
    const xpDelta = ledgerWritten ? amount : 0;

    const streak = applyCompletionToStreak(
      {
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        lastCompletedDate: stats.lastCompletedDate,
      },
      today,
    );

    const totalXp = Math.max(0, stats.totalXp + xpDelta);
    const level = calculateLevel(totalXp);

    await tx.userStats.update({
      where: { userId },
      data: {
        totalXp,
        level,
        tasksCompleted: { increment: 1 },
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastCompletedDate: streak.lastCompletedDate,
      },
    });

    return {
      taskId: task.id,
      title: task.title,
      changed: true,
      xpDelta,
      totalXp,
      level,
      previousLevel: stats.level,
      leveledUp: level > stats.level,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
    };
  });
}

/**
 * Reopens a completed task and reverses the XP it granted.
 *
 * The reversal amount comes from the AWARD row for that cycle, not from the
 * task's current `xpReward`. Raising a task's reward after completing it
 * therefore cannot be used to withdraw more XP than was ever granted.
 *
 * The streak is intentionally left alone: the user genuinely did finish
 * something on that day, and un-ticking a checkbox is not a reason to erase it.
 */
export async function reopenTask(
  userId: string,
  taskId: string,
  now: Date = new Date(),
): Promise<CompletionOutcome> {
  return prisma.$transaction(async (tx) => {
    const swap = await tx.task.updateMany({
      where: { id: taskId, userId, completed: true },
      data: { completed: false, completedAt: null },
    });

    const task = await tx.task.findFirst({
      where: { id: taskId, userId },
      // completionCount is deliberately NOT decremented: the next completion
      // must land on a fresh cycle so its AWARD row cannot collide.
      select: { id: true, title: true, completionCount: true },
    });

    if (!task) throw new NotFoundError("That task could not be found.");

    const stats = await readStats(tx, userId);

    if (swap.count === 0) {
      return noOpOutcome(task.id, task.title, stats);
    }

    const cycle = task.completionCount;

    const award = await tx.xpTransaction.findFirst({
      where: { taskId: task.id, kind: "AWARD", cycle },
      select: { amount: true },
    });

    let xpDelta = 0;
    if (award && award.amount !== 0) {
      const written = await writeLedgerEntry(tx, {
        userId,
        taskId: task.id,
        amount: -award.amount,
        kind: "REVERSAL",
        cycle,
        description: `Reopened “${task.title}”`,
      });
      if (written) xpDelta = -award.amount;
    }

    const totalXp = Math.max(0, stats.totalXp + xpDelta);
    const level = calculateLevel(totalXp);

    await tx.userStats.update({
      where: { userId },
      data: {
        totalXp,
        level,
        tasksCompleted: { decrement: stats.tasksCompleted > 0 ? 1 : 0 },
      },
    });

    return {
      taskId: task.id,
      title: task.title,
      changed: true,
      xpDelta,
      totalXp,
      level,
      previousLevel: stats.level,
      leveledUp: false,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
    };
  });
}

/** Convenience wrapper used by the UI's single toggle control. */
export async function setTaskCompletion(
  userId: string,
  taskId: string,
  completed: boolean,
  timezone: string,
  now: Date = new Date(),
): Promise<CompletionOutcome> {
  return completed ? completeTask(userId, taskId, timezone, now) : reopenTask(userId, taskId, now);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createTask(userId: string, input: TaskInput) {
  return prisma.$transaction(async (tx) => {
    // Inside the transaction, so the assignment cannot be invalidated between
    // the check and the insert by a concurrent project deletion.
    await assertTaskAssignment(tx, userId, input.projectId, input.milestoneId);

    return tx.task.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        categoryId: input.categoryId,
        dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
        dueTime: input.dueTime,
        estimatedMinutes: input.estimatedMinutes,
        xpReward: input.xpReward,
        projectId: input.projectId,
        milestoneId: input.milestoneId,
      },
      select: { id: true },
    });
  });
}

/**
 * Updates a task the caller owns.
 *
 * Uses `updateMany` with the ownership predicate rather than `update` by id:
 * an `update` would need a separate ownership read first, leaving a window
 * between the check and the write.
 */
export async function updateTask(userId: string, taskId: string, input: TaskInput) {
  await prisma.$transaction(async (tx) => {
    await assertTaskAssignment(tx, userId, input.projectId, input.milestoneId);

    const result = await tx.task.updateMany({
      where: { id: taskId, userId },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        categoryId: input.categoryId,
        dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
        dueTime: input.dueTime,
        estimatedMinutes: input.estimatedMinutes,
        xpReward: input.xpReward,
        projectId: input.projectId,
        milestoneId: input.milestoneId,
      },
    });

    if (result.count === 0) throw new NotFoundError("That task could not be found.");
  });
}

/**
 * Moves a task into or out of a project and/or milestone.
 *
 * Covers every assignment operation the UI offers — assign, unassign, move
 * between milestones — because they are all the same write: set the pair, or
 * set it to null. Nothing else about the task changes, and in particular
 * nothing about XP: where a task is filed has no bearing on what completing it
 * is worth.
 */
export async function setTaskAssignment(
  userId: string,
  taskId: string,
  projectId: string | null,
  milestoneId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertTaskAssignment(tx, userId, projectId, milestoneId);

    const result = await tx.task.updateMany({
      where: { id: taskId, userId },
      data: { projectId, milestoneId },
    });

    if (result.count === 0) throw new NotFoundError("That task could not be found.");
  });
}

/**
 * The relationship guard.
 *
 * Three rules, all enforced against the database rather than taken on trust
 * from the request:
 *
 *   1. A milestone always needs a project.
 *   2. The project must belong to the caller.
 *   3. The milestone must belong to *that* project — which, given (2), also
 *      means it belongs to the caller.
 *
 * Rule 3 is the one a naive implementation misses: checking that the caller
 * owns the project and separately that the caller owns the milestone still
 * permits filing a task under Project A with a milestone from Project B. The
 * check here is a single query keyed on both ids, so that combination cannot
 * pass.
 *
 * A foreign or non-existent id produces the same `NotFoundError` either way.
 */
export async function assertTaskAssignment(
  tx: TxClient,
  userId: string,
  projectId: string | null,
  milestoneId: string | null,
): Promise<void> {
  if (!projectId && !milestoneId) return;

  if (milestoneId && !projectId) {
    throw new InvalidAssignmentError("A milestone needs a project.");
  }

  if (projectId) {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) throw new NotFoundError("That project could not be found.");
  }

  if (milestoneId) {
    // Keyed on both ids at once: a milestone from a different project simply
    // does not match, no matter who owns either.
    const milestone = await tx.milestone.findFirst({
      where: { id: milestoneId, projectId: projectId as string, project: { userId } },
      select: { id: true },
    });
    if (!milestone) {
      throw new InvalidAssignmentError("That milestone does not belong to the chosen project.");
    }
  }
}

/** A structurally impossible project/milestone pairing. */
export class InvalidAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssignmentError";
  }
}

/**
 * Deletes a task the caller owns.
 *
 * The task's ledger rows cascade away with it, so the cached `totalXp` is
 * brought back in line with the ledger in the same transaction.
 */
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true, completed: true },
    });
    if (!task) throw new NotFoundError("That task could not be found.");

    const ledger = await tx.xpTransaction.aggregate({
      where: { taskId: task.id },
      _sum: { amount: true },
    });
    const forfeited = ledger._sum.amount ?? 0;

    await tx.task.delete({ where: { id: task.id } });

    if (forfeited !== 0 || task.completed) {
      const stats = await readStats(tx, userId);
      const totalXp = Math.max(0, stats.totalXp - forfeited);
      await tx.userStats.update({
        where: { userId },
        data: {
          totalXp,
          level: calculateLevel(totalXp),
          tasksCompleted: task.completed && stats.tasksCompleted > 0 ? { decrement: 1 } : undefined,
        },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface StatsSnapshot {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: LocalDate | null;
  tasksCompleted: number;
}

/** Reads stats, creating the row if an older account is missing one. */
async function readStats(tx: TxClient, userId: string): Promise<StatsSnapshot> {
  const stats = await tx.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      totalXp: true,
      level: true,
      currentStreak: true,
      longestStreak: true,
      lastCompletedDate: true,
      tasksCompleted: true,
    },
  });
  return stats;
}

interface LedgerEntry {
  userId: string;
  taskId: string;
  amount: number;
  kind: "AWARD" | "REVERSAL";
  cycle: number;
  description: string;
}

/**
 * Writes a ledger row, returning false if the unique index already holds one.
 *
 * Swallowing only P2002 is important: any other failure is a real error and
 * must abort the surrounding transaction rather than silently skipping XP.
 */
async function writeLedgerEntry(tx: TxClient, entry: LedgerEntry): Promise<boolean> {
  try {
    await tx.xpTransaction.create({
      data: {
        userId: entry.userId,
        taskId: entry.taskId,
        amount: entry.amount,
        kind: entry.kind,
        cycle: entry.cycle,
        source: "TASK_COMPLETION",
        description: entry.description,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

function noOpOutcome(taskId: string, title: string, stats: StatsSnapshot): CompletionOutcome {
  return {
    taskId,
    title,
    changed: false,
    xpDelta: 0,
    totalXp: stats.totalXp,
    level: stats.level,
    previousLevel: stats.level,
    leveledUp: false,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
  };
}
