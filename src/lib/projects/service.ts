import "server-only";

import { MAX_MILESTONES_PER_PROJECT } from "@/config/projects";
import { NotFoundError } from "@/lib/auth/guard";
import { localDateToDbDate } from "@/lib/datetime";
import { assertGoalOwned } from "@/lib/goals/service";
import { prisma } from "@/lib/prisma";
import type { MilestoneInput, ProjectInput } from "@/lib/validation/project";
import type { MilestoneStatus, ProjectStatus } from "@/generated/prisma/enums";

/**
 * Project and milestone write operations.
 *
 * Authorisation follows exactly the pattern Phase 1 established for tasks:
 * every mutation takes `userId` first and folds it into the WHERE clause, so
 * the ownership check and the write are a single statement with no window
 * between them. There is no code path that loads a project by id alone.
 *
 * Milestones have no `userId` column — ownership reaches them through their
 * project, expressed as a relation filter (`project: { userId }`). That
 * compiles to a subquery, so it is still one statement and still atomic.
 *
 * A caller who is not the owner gets `NotFoundError`, identical to the error
 * for an id that never existed. Distinguishing the two would confirm to an
 * attacker that a given project exists.
 *
 * Nothing in this file touches XP. Organising work is not achievement, and
 * inventing project XP would let a user mint points by creating and completing
 * empty projects.
 */

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(userId: string, input: ProjectInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    // Inside the transaction, so the goal cannot be deleted between the check
    // and the insert — and so a foreign goal id is rejected rather than stored.
    if (input.goalId) await assertGoalOwned(tx, userId, input.goalId);

    return tx.project.create({
      data: {
        userId,
        goalId: input.goalId,
        name: input.name,
        description: input.description,
        color: input.color,
        priority: input.priority,
        status: input.status,
        startDate: input.startDate ? localDateToDbDate(input.startDate) : null,
        dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
        archivedAt: input.status === "ARCHIVED" ? new Date() : null,
      },
      select: { id: true },
    });
  });
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: ProjectInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: { status: true, completedAt: true, archivedAt: true },
    });
    if (!current) throw new NotFoundError("That project could not be found.");

    if (input.goalId) await assertGoalOwned(tx, userId, input.goalId);

    await tx.project.updateMany({
      where: { id: projectId, userId },
      data: {
        goalId: input.goalId,
        name: input.name,
        description: input.description,
        color: input.color,
        priority: input.priority,
        status: input.status,
        startDate: input.startDate ? localDateToDbDate(input.startDate) : null,
        dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
        // Editing a project should not silently rewrite when it was finished,
        // so the timestamps only move when the status itself moves.
        ...statusTimestamps(current.status, input.status, current),
      },
    });
  });
}

/**
 * Moves a project between lifecycle states.
 *
 * One function rather than four (complete / reopen / archive / restore),
 * because they differ only in the target state and the timestamps that follow
 * from it — and keeping that logic in one place is what stops `completedAt`
 * and `status` drifting apart.
 */
export async function setProjectStatus(
  userId: string,
  projectId: string,
  status: ProjectStatus,
): Promise<{ changed: boolean; status: ProjectStatus }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: { status: true, completedAt: true, archivedAt: true },
    });
    if (!current) throw new NotFoundError("That project could not be found.");

    if (current.status === status) return { changed: false, status };

    await tx.project.updateMany({
      where: { id: projectId, userId },
      data: { status, ...statusTimestamps(current.status, status, current) },
    });

    return { changed: true, status };
  });
}

/**
 * Deletes a project.
 *
 * Its milestones go with it (FK cascade) but its tasks do not: both foreign
 * keys are `ON DELETE SET NULL`, so the tasks survive, detached. The database
 * does this in one statement — the transaction here exists to read the counts
 * first, so the confirmation can tell the user exactly what is about to be
 * detached rather than leaving them to guess.
 */
export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<{ detachedTasks: number; deletedMilestones: number }> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) throw new NotFoundError("That project could not be found.");

    const [detachedTasks, deletedMilestones] = await Promise.all([
      tx.task.count({ where: { projectId: project.id, userId } }),
      tx.milestone.count({ where: { projectId: project.id } }),
    ]);

    await tx.project.delete({ where: { id: project.id } });

    return { detachedTasks, deletedMilestones };
  });
}

/** Keeps `completedAt` / `archivedAt` coherent with a status transition. */
function statusTimestamps(
  from: ProjectStatus,
  to: ProjectStatus,
  current: { completedAt: Date | null; archivedAt: Date | null },
): { completedAt: Date | null; archivedAt: Date | null } {
  if (from === to) return { completedAt: current.completedAt, archivedAt: current.archivedAt };

  switch (to) {
    case "COMPLETED":
      // Finishing an archived project also brings it back out of the archive:
      // "done" is a more informative state than "put away".
      return { completedAt: new Date(), archivedAt: null };
    case "ARCHIVED":
      // Archiving preserves when it was finished, if it ever was.
      return { completedAt: current.completedAt, archivedAt: new Date() };
    case "ACTIVE":
      // Reopening clears both: the project is live work again.
      return { completedAt: null, archivedAt: null };
  }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestone(
  userId: string,
  projectId: string,
  input: MilestoneInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await assertProjectOwned(tx, userId, projectId);

    const count = await tx.milestone.count({ where: { projectId } });
    if (count >= MAX_MILESTONES_PER_PROJECT) {
      throw new NotFoundError(
        `A project can hold at most ${MAX_MILESTONES_PER_PROJECT} milestones.`,
      );
    }

    // Append to the end. Positions are sparse by design, so reading the max
    // rather than the count keeps ordering stable after deletions.
    const last = await tx.milestone.findFirst({
      where: { projectId },
      select: { position: true },
      orderBy: { position: "desc" },
    });

    return tx.milestone.create({
      data: {
        projectId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
        position: (last?.position ?? -1) + 1,
      },
      select: { id: true },
    });
  });
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  input: MilestoneInput,
): Promise<void> {
  // The relation filter is the authorisation: a milestone whose project is not
  // this user's matches zero rows.
  const result = await prisma.milestone.updateMany({
    where: { id: milestoneId, project: { userId } },
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ? localDateToDbDate(input.dueDate) : null,
    },
  });

  if (result.count === 0) throw new NotFoundError("That milestone could not be found.");
}

export async function setMilestoneStatus(
  userId: string,
  milestoneId: string,
  status: MilestoneStatus,
): Promise<{ changed: boolean }> {
  // Compare-and-swap: the current status is part of the WHERE, so concurrent
  // toggles settle in the database exactly as task completion does.
  const swap = await prisma.milestone.updateMany({
    where: {
      id: milestoneId,
      project: { userId },
      status: status === "COMPLETED" ? "PENDING" : "COMPLETED",
    },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });

  if (swap.count > 0) return { changed: true };

  // No row changed: either it was already in that state, or it is not ours.
  const exists = await prisma.milestone.findFirst({
    where: { id: milestoneId, project: { userId } },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError("That milestone could not be found.");

  return { changed: false };
}

/**
 * Deletes a milestone. Its tasks survive with `milestoneId` set to null by the
 * foreign key, keeping their project assignment intact.
 */
export async function deleteMilestone(
  userId: string,
  milestoneId: string,
): Promise<{ detachedTasks: number }> {
  return prisma.$transaction(async (tx) => {
    const milestone = await tx.milestone.findFirst({
      where: { id: milestoneId, project: { userId } },
      select: { id: true },
    });
    if (!milestone) throw new NotFoundError("That milestone could not be found.");

    const detachedTasks = await tx.task.count({ where: { milestoneId: milestone.id } });
    await tx.milestone.delete({ where: { id: milestone.id } });

    return { detachedTasks };
  });
}

/**
 * Rewrites milestone order within a project.
 *
 * Takes the complete ordered list of ids. Any id that is not a milestone of
 * this project — including one belonging to somebody else's project — makes
 * the whole call fail rather than reordering a subset, so a tampered payload
 * cannot produce a half-applied order.
 */
export async function reorderMilestones(
  userId: string,
  projectId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertProjectOwned(tx, userId, projectId);

    const owned = await tx.milestone.findMany({
      where: { projectId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((m) => m.id));

    if (orderedIds.length !== ownedIds.size || !orderedIds.every((id) => ownedIds.has(id))) {
      throw new NotFoundError("That milestone order does not match this project.");
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        tx.milestone.updateMany({ where: { id, projectId }, data: { position: index } }),
      ),
    );
  });
}

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

/** Throws unless `projectId` names a project owned by `userId`. */
export async function assertProjectOwned(
  tx: TxClient,
  userId: string,
  projectId: string,
): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new NotFoundError("That project could not be found.");
}
