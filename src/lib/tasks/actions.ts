"use server";

import { revalidatePath } from "next/cache";
import { CATEGORY_COLOR_VALUES } from "@/config/categories";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { validateCategory, validateTask } from "@/lib/validation/task";
import { getCategories } from "./queries";
// A "use server" module may only export async functions, so the form-state
// shape and its initial value live in their own module.
import type { TaskFormState } from "./form-state";
import { createTask, deleteTask, setTaskCompletion, updateTask } from "./service";

/**
 * Task Server Actions — the app's only write surface.
 *
 * Every one of them starts by resolving the session server-side and then
 * passes that `userId` into the service layer. Nothing about ownership is ever
 * read from the request body, so a tampered form cannot address another user's
 * data.
 *
 * They return serialisable state rather than throwing, because these are
 * consumed by `useActionState` and an unhandled throw surfaces to the user as
 * a blank error page.
 */

/** Maps a thrown error to a message safe to show a user. */
function toErrorState(error: unknown, fallback: string): TaskFormState {
  if (error instanceof UnauthorizedError) {
    return { status: "error", errors: { _form: error.message } };
  }
  if (error instanceof NotFoundError) {
    return { status: "error", errors: { _form: error.message } };
  }
  // Log the detail, show the user something actionable and non-leaky.
  console.error("[tasks]", fallback, error);
  return { status: "error", errors: { _form: fallback } };
}

/**
 * Every surface that reads tasks is invalidated together.
 *
 * Today and the calendar are both views over the same `dueDate` column, so a
 * completion or a moved date has to reach them as surely as it reaches the
 * task list. Missing one is how a page starts showing yesterday's answer.
 */
function revalidateTaskViews(): void {
  revalidatePath("/app");
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  revalidatePath("/app/calendar");
}

export async function createTaskAction(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    // Validate the category against *this user's* categories, so a foreign id
    // is rejected as invalid input rather than silently attached.
    const categories = await getCategories(user.id);
    const result = validateTask(formData, categories.map((c) => c.id));
    if (!result.ok) return { status: "error", errors: result.errors };

    await createTask(user.id, result.data);
    revalidateTaskViews();

    return { status: "success", message: "Task created." };
  } catch (error) {
    return toErrorState(error, "We could not create that task. Please try again.");
  }
}

export async function updateTaskAction(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const taskId = String(formData.get("taskId") ?? "");
    if (!taskId) return { status: "error", errors: { _form: "Missing task reference." } };

    const categories = await getCategories(user.id);
    const result = validateTask(formData, categories.map((c) => c.id));
    if (!result.ok) return { status: "error", errors: result.errors };

    await updateTask(user.id, taskId, result.data);
    revalidateTaskViews();

    return { status: "success", message: "Task updated." };
  } catch (error) {
    return toErrorState(error, "We could not save that task. Please try again.");
  }
}

export async function deleteTaskAction(taskId: string): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    await deleteTask(user.id, taskId);
    revalidateTaskViews();

    return { status: "success", message: "Task deleted." };
  } catch (error) {
    return toErrorState(error, "We could not delete that task. Please try again.");
  }
}

/**
 * Toggles completion.
 *
 * The client sends only the task id and the desired state — never an XP value.
 * The server reads the reward from the stored row, so the ledger cannot be
 * inflated from the browser.
 */
export async function toggleTaskAction(taskId: string, completed: boolean): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const outcome = await setTaskCompletion(user.id, taskId, completed, user.timezone);
    revalidateTaskViews();

    return {
      status: "success",
      outcome: { xpDelta: outcome.xpDelta, level: outcome.level, leveledUp: outcome.leveledUp },
    };
  } catch (error) {
    return toErrorState(error, "We could not update that task. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategoryAction(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const result = validateCategory(formData, CATEGORY_COLOR_VALUES);
    if (!result.ok) return { status: "error", errors: result.errors };

    const existing = await prisma.category.findFirst({
      where: { userId: user.id, name: result.data.name },
      select: { id: true },
    });
    if (existing) {
      return { status: "error", errors: { name: "You already have a category with that name." } };
    }

    await prisma.category.create({
      data: { userId: user.id, name: result.data.name, color: result.data.color },
    });

    revalidateTaskViews();
    revalidatePath("/app/settings");
    return { status: "success", message: "Category created." };
  } catch (error) {
    return toErrorState(error, "We could not create that category. Please try again.");
  }
}

/**
 * Archives rather than deletes.
 *
 * Tasks keep their `categoryId`, so restoring a category in a later phase
 * restores the grouping. A hard delete would silently orphan history.
 */
export async function archiveCategoryAction(categoryId: string): Promise<TaskFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const result = await prisma.category.updateMany({
      where: { id: categoryId, userId: user.id },
      data: { isArchived: true },
    });
    if (result.count === 0) throw new NotFoundError("That category could not be found.");

    revalidateTaskViews();
    revalidatePath("/app/settings");
    return { status: "success", message: "Category archived." };
  } catch (error) {
    return toErrorState(error, "We could not archive that category. Please try again.");
  }
}
