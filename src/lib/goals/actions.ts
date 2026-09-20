"use server";

import { revalidatePath } from "next/cache";
import { GOAL_STATUSES } from "@/config/goals";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { validateGoal } from "@/lib/validation/goal";
import type { GoalStatus } from "@/generated/prisma/enums";
import type { GoalFormState } from "./form-state";
import { createGoal, deleteGoal, setGoalStatus, setProjectGoal, updateGoal } from "./service";

/**
 * Goal Server Actions.
 *
 * Identical contract to the task and project actions: resolve the session
 * server-side, validate, then hand the authenticated `userId` to the service
 * layer. No ownership information is ever read from the request body, so a
 * tampered form cannot address another user's goal.
 *
 * They return serialisable state rather than throwing, because `useActionState`
 * consumes them and an unhandled throw renders as a blank error page.
 */

function toErrorState(error: unknown, fallback: string): GoalFormState {
  if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
    return { status: "error", errors: { _form: error.message } };
  }
  console.error("[goals]", fallback, error);
  return { status: "error", errors: { _form: fallback } };
}

/** Goals surface on their own pages, the project pages and the dashboard. */
function revalidateGoalViews(goalId?: string, projectId?: string): void {
  revalidatePath("/app");
  revalidatePath("/app/goals");
  revalidatePath("/app/projects");
  if (goalId) revalidatePath(`/app/goals/${goalId}`);
  if (projectId) revalidatePath(`/app/projects/${projectId}`);
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function createGoalAction(
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  try {
    const userId = await requireUserId();

    const result = validateGoal(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    const goal = await createGoal(userId, result.data);
    revalidateGoalViews(goal.id);

    return { status: "success", message: "Goal created.", createdId: goal.id };
  } catch (error) {
    return toErrorState(error, "We could not create that goal. Please try again.");
  }
}

export async function updateGoalAction(
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  try {
    const userId = await requireUserId();

    const goalId = String(formData.get("goalId") ?? "");
    if (!goalId) return { status: "error", errors: { _form: "Missing goal reference." } };

    const result = validateGoal(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    await updateGoal(userId, goalId, result.data);
    revalidateGoalViews(goalId);

    return { status: "success", message: "Goal updated." };
  } catch (error) {
    return toErrorState(error, "We could not save that goal. Please try again.");
  }
}

function isGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value);
}

/**
 * Complete / reopen / archive / restore.
 *
 * One action for all four: they differ only in the target state, and the
 * service keeps the timestamps coherent. The status is validated against the
 * enum rather than trusted, so an arbitrary string cannot reach the database.
 */
export async function setGoalStatusAction(
  goalId: string,
  status: string,
): Promise<GoalFormState> {
  try {
    const userId = await requireUserId();

    if (!isGoalStatus(status)) {
      return { status: "error", errors: { _form: "That is not a valid goal status." } };
    }

    const outcome = await setGoalStatus(userId, goalId, status);
    revalidateGoalViews(goalId);

    const messages: Record<GoalStatus, string> = {
      ACTIVE: "Goal reopened.",
      COMPLETED: "Goal achieved.",
      ARCHIVED: "Goal archived. Its projects are untouched.",
    };

    return {
      status: "success",
      message: outcome.changed ? messages[status] : "No change — it was already in that state.",
    };
  } catch (error) {
    return toErrorState(error, "We could not update that goal. Please try again.");
  }
}

export async function deleteGoalAction(goalId: string): Promise<GoalFormState> {
  try {
    const userId = await requireUserId();

    const { releasedProjects } = await deleteGoal(userId, goalId);
    revalidateGoalViews(goalId);

    return {
      status: "success",
      message:
        releasedProjects > 0
          ? `Goal deleted. ${releasedProjects} ${releasedProjects === 1 ? "project was" : "projects were"} kept and released.`
          : "Goal deleted.",
    };
  } catch (error) {
    return toErrorState(error, "We could not delete that goal. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Project assignment
// ---------------------------------------------------------------------------

/**
 * Connects a project to a goal, moves it between goals, or releases it.
 *
 * An empty string means "no goal" — that is how a `<select>` with a blank
 * option arrives. The service validates both sides against the caller before
 * writing, so a foreign goal or a foreign project is rejected either way.
 */
export async function setProjectGoalAction(
  projectId: string,
  goalId: string | null,
): Promise<GoalFormState> {
  try {
    const userId = await requireUserId();

    const goal = goalId ? goalId : null;
    await setProjectGoal(userId, projectId, goal);
    revalidateGoalViews(goal ?? undefined, projectId);

    return {
      status: "success",
      message: goal ? "Project connected." : "Project released from its goal.",
    };
  } catch (error) {
    return toErrorState(error, "We could not move that project. Please try again.");
  }
}
