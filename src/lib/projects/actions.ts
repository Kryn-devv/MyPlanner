"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { InvalidAssignmentError, setTaskAssignment } from "@/lib/tasks/service";
import { validateMilestone, validateProject } from "@/lib/validation/project";
import { PROJECT_STATUSES } from "@/config/projects";
import type { MilestoneStatus, ProjectStatus } from "@/generated/prisma/enums";
import type { ProjectFormState } from "./form-state";
import {
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  reorderMilestones,
  setMilestoneStatus,
  setProjectStatus,
  updateMilestone,
  updateProject,
} from "./service";

/**
 * Project Server Actions.
 *
 * Identical contract to the task actions: resolve the session server-side,
 * validate, then hand the authenticated `userId` to the service layer. No
 * ownership information is ever read from the request body, so a tampered form
 * cannot address another user's project.
 *
 * They return serialisable state rather than throwing, because `useActionState`
 * consumes them and an unhandled throw renders as a blank error page.
 */

function toErrorState(error: unknown, fallback: string): ProjectFormState {
  if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
    return { status: "error", errors: { _form: error.message } };
  }
  if (error instanceof InvalidAssignmentError) {
    return { status: "error", errors: { _form: error.message } };
  }
  console.error("[projects]", fallback, error);
  return { status: "error", errors: { _form: fallback } };
}

/** Projects surface on their own pages, the task page and the dashboard. */
function revalidateProjectViews(projectId?: string): void {
  revalidatePath("/app");
  revalidatePath("/app/projects");
  revalidatePath("/app/tasks");
  if (projectId) revalidatePath(`/app/projects/${projectId}`);
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const result = validateProject(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    const project = await createProject(userId, result.data);
    revalidateProjectViews(project.id);

    return { status: "success", message: "Project created.", createdId: project.id };
  } catch (error) {
    return toErrorState(error, "We could not create that project. Please try again.");
  }
}

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const projectId = String(formData.get("projectId") ?? "");
    if (!projectId) return { status: "error", errors: { _form: "Missing project reference." } };

    const result = validateProject(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    await updateProject(userId, projectId, result.data);
    revalidateProjectViews(projectId);

    return { status: "success", message: "Project updated." };
  } catch (error) {
    return toErrorState(error, "We could not save that project. Please try again.");
  }
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/**
 * Complete / reopen / archive / restore.
 *
 * One action for all four: they differ only in the target state, and the
 * service keeps the timestamps coherent. The status is validated against the
 * enum rather than trusted, so an arbitrary string cannot reach the database.
 */
export async function setProjectStatusAction(
  projectId: string,
  status: string,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    if (!isProjectStatus(status)) {
      return { status: "error", errors: { _form: "That is not a valid project status." } };
    }

    const outcome = await setProjectStatus(userId, projectId, status);
    revalidateProjectViews(projectId);

    const messages: Record<ProjectStatus, string> = {
      ACTIVE: "Project reopened.",
      COMPLETED: "Project completed.",
      ARCHIVED: "Project archived.",
    };

    return {
      status: "success",
      message: outcome.changed ? messages[status] : "No change — it was already in that state.",
    };
  } catch (error) {
    return toErrorState(error, "We could not update that project. Please try again.");
  }
}

export async function deleteProjectAction(projectId: string): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const { detachedTasks } = await deleteProject(userId, projectId);
    revalidateProjectViews(projectId);

    return {
      status: "success",
      message:
        detachedTasks > 0
          ? `Project deleted. ${detachedTasks} ${detachedTasks === 1 ? "task was" : "tasks were"} kept and unassigned.`
          : "Project deleted.",
    };
  } catch (error) {
    return toErrorState(error, "We could not delete that project. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestoneAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const projectId = String(formData.get("projectId") ?? "");
    if (!projectId) return { status: "error", errors: { _form: "Missing project reference." } };

    const result = validateMilestone(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    const milestone = await createMilestone(userId, projectId, result.data);
    revalidateProjectViews(projectId);

    return { status: "success", message: "Milestone added.", createdId: milestone.id };
  } catch (error) {
    return toErrorState(error, "We could not add that milestone. Please try again.");
  }
}

export async function updateMilestoneAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const milestoneId = String(formData.get("milestoneId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    if (!milestoneId) return { status: "error", errors: { _form: "Missing milestone reference." } };

    const result = validateMilestone(formData);
    if (!result.ok) return { status: "error", errors: result.errors };

    await updateMilestone(userId, milestoneId, result.data);
    revalidateProjectViews(projectId || undefined);

    return { status: "success", message: "Milestone updated." };
  } catch (error) {
    return toErrorState(error, "We could not save that milestone. Please try again.");
  }
}

export async function setMilestoneStatusAction(
  milestoneId: string,
  completed: boolean,
  projectId?: string,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const status: MilestoneStatus = completed ? "COMPLETED" : "PENDING";
    const outcome = await setMilestoneStatus(userId, milestoneId, status);
    revalidateProjectViews(projectId);

    return {
      status: "success",
      message: outcome.changed
        ? completed
          ? "Milestone completed."
          : "Milestone reopened."
        : "No change.",
    };
  } catch (error) {
    return toErrorState(error, "We could not update that milestone. Please try again.");
  }
}

export async function deleteMilestoneAction(
  milestoneId: string,
  projectId?: string,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const { detachedTasks } = await deleteMilestone(userId, milestoneId);
    revalidateProjectViews(projectId);

    return {
      status: "success",
      message:
        detachedTasks > 0
          ? `Milestone deleted. ${detachedTasks} ${detachedTasks === 1 ? "task stays" : "tasks stay"} in the project.`
          : "Milestone deleted.",
    };
  } catch (error) {
    return toErrorState(error, "We could not delete that milestone. Please try again.");
  }
}

export async function reorderMilestonesAction(
  projectId: string,
  orderedIds: string[],
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    await reorderMilestones(userId, projectId, orderedIds);
    revalidateProjectViews(projectId);

    return { status: "success", message: "Milestones reordered." };
  } catch (error) {
    return toErrorState(error, "We could not reorder those milestones. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Task assignment
// ---------------------------------------------------------------------------

/**
 * Files a task into (or out of) a project and milestone.
 *
 * Empty strings mean "none" — that is how a `<select>` with a blank option
 * arrives. The service validates the pair against the database before writing,
 * so a milestone from another project is rejected here just as it is in the
 * task form.
 */
export async function assignTaskAction(
  taskId: string,
  projectId: string | null,
  milestoneId: string | null,
): Promise<ProjectFormState> {
  try {
    const userId = await requireUserId();

    const project = projectId ? projectId : null;
    const milestone = milestoneId ? milestoneId : null;

    await setTaskAssignment(userId, taskId, project, milestone);
    revalidateProjectViews(project ?? undefined);

    return {
      status: "success",
      message: project ? "Task moved." : "Task removed from its project.",
    };
  } catch (error) {
    return toErrorState(error, "We could not move that task. Please try again.");
  }
}
