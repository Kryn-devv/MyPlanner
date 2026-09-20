import "server-only";

import { NotFoundError } from "@/lib/auth/guard";
import { localDateToDbDate } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import type { GoalInput } from "@/lib/validation/goal";
import type { GoalStatus } from "@/generated/prisma/enums";

/**
 * Goal write operations.
 *
 * Authorisation follows the pattern established for tasks in Phase 1 and
 * projects in Phase 2: every mutation takes `userId` first and folds it into
 * the WHERE clause, so the ownership check and the write are one statement with
 * no window between them. No code path loads a goal by id alone.
 *
 * A caller who is not the owner gets `NotFoundError`, identical to the error
 * for an id that never existed — distinguishing the two would confirm to an
 * attacker that a given goal exists.
 *
 * Nothing here touches XP. Task completion remains the only source of XP;
 * inventing goal XP would create a second reward economy in which a user could
 * mint points by declaring empty goals achieved.
 *
 * Nothing here cascades status either. Archiving a goal leaves its projects
 * exactly as they were — see `setGoalStatus`.
 */

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createGoal(userId: string, input: GoalInput): Promise<{ id: string }> {
  return prisma.goal.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      startDate: input.startDate ? localDateToDbDate(input.startDate) : null,
      targetDate: input.targetDate ? localDateToDbDate(input.targetDate) : null,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
      archivedAt: input.status === "ARCHIVED" ? new Date() : null,
    },
    select: { id: true },
  });
}

export async function updateGoal(userId: string, goalId: string, input: GoalInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.goal.findFirst({
      where: { id: goalId, userId },
      select: { status: true, completedAt: true, archivedAt: true },
    });
    if (!current) throw new NotFoundError("That goal could not be found.");

    await tx.goal.updateMany({
      where: { id: goalId, userId },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        startDate: input.startDate ? localDateToDbDate(input.startDate) : null,
        targetDate: input.targetDate ? localDateToDbDate(input.targetDate) : null,
        // Editing a goal should not silently rewrite when it was achieved, so
        // the timestamps only move when the status itself moves.
        ...statusTimestamps(current.status, input.status, current),
      },
    });
  });
}

/**
 * Moves a goal between lifecycle states.
 *
 * One function rather than four (complete / reopen / archive / restore): they
 * differ only in the target state and the timestamps that follow from it, and
 * keeping that in one place is what stops `completedAt` and `status` drifting
 * apart.
 *
 * Connected projects are deliberately left alone. Archiving a goal is a
 * statement about the objective, not about the work — someone may well shelve
 * "learn Japanese" while still finishing the textbook they already started.
 * Cascading status downwards would make an organisational tidy-up silently
 * rewrite a week of someone's plans.
 */
export async function setGoalStatus(
  userId: string,
  goalId: string,
  status: GoalStatus,
): Promise<{ changed: boolean; status: GoalStatus }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.goal.findFirst({
      where: { id: goalId, userId },
      select: { status: true, completedAt: true, archivedAt: true },
    });
    if (!current) throw new NotFoundError("That goal could not be found.");

    if (current.status === status) return { changed: false, status };

    await tx.goal.updateMany({
      where: { id: goalId, userId },
      data: { status, ...statusTimestamps(current.status, status, current) },
    });

    return { changed: true, status };
  });
}

/**
 * Deletes a goal.
 *
 * Its projects are released, not destroyed: `Project.goalId` is
 * `ON DELETE SET NULL`, so the projects — and their milestones, tasks and XP
 * history — all survive, simply no longer laddering up to anything. The
 * database does this in one statement; the transaction here exists to read the
 * count first so the confirmation can tell the user exactly what is about to be
 * released rather than leaving them to guess.
 */
export async function deleteGoal(
  userId: string,
  goalId: string,
): Promise<{ releasedProjects: number }> {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!goal) throw new NotFoundError("That goal could not be found.");

    const releasedProjects = await tx.project.count({ where: { goalId: goal.id, userId } });

    await tx.goal.delete({ where: { id: goal.id } });

    return { releasedProjects };
  });
}

/** Keeps `completedAt` / `archivedAt` coherent with a status transition. */
function statusTimestamps(
  from: GoalStatus,
  to: GoalStatus,
  current: { completedAt: Date | null; archivedAt: Date | null },
): { completedAt: Date | null; archivedAt: Date | null } {
  if (from === to) return { completedAt: current.completedAt, archivedAt: current.archivedAt };

  switch (to) {
    case "COMPLETED":
      // Achieving an archived goal also brings it back out of the archive:
      // "achieved" is a more informative state than "put away".
      return { completedAt: new Date(), archivedAt: null };
    case "ARCHIVED":
      // Archiving preserves when it was achieved, if it ever was.
      return { completedAt: current.completedAt, archivedAt: new Date() };
    case "ACTIVE":
      // Reopening clears both: the goal is live again.
      return { completedAt: null, archivedAt: null };
  }
}

// ---------------------------------------------------------------------------
// Project assignment
// ---------------------------------------------------------------------------

/**
 * Connects a project to a goal, moves it between goals, or releases it.
 *
 * One operation for all three, because they are the same write: set `goalId`,
 * or set it to null. Both sides are verified against the caller in the same
 * transaction, so a project owned by one person can never be filed under
 * another person's goal — and neither id is taken on trust from the request.
 */
export async function setProjectGoal(
  userId: string,
  projectId: string,
  goalId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (goalId) await assertGoalOwned(tx, userId, goalId);

    // `updateMany` scoped by userId: the ownership check on the project side
    // and the write are a single statement.
    const result = await tx.project.updateMany({
      where: { id: projectId, userId },
      data: { goalId },
    });

    if (result.count === 0) throw new NotFoundError("That project could not be found.");
  });
}

/** Throws unless `goalId` names a goal owned by `userId`. */
export async function assertGoalOwned(
  tx: TxClient,
  userId: string,
  goalId: string,
): Promise<void> {
  const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) throw new NotFoundError("That goal could not be found.");
}
