"use server";

import { revalidatePath } from "next/cache";
import type { HabitStatus } from "@/generated/prisma/enums";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocalToday, isLocalDate, type LocalDate } from "@/lib/datetime";
import { validateHabit } from "@/lib/validation/habit";
import type { HabitFormState } from "./form-state";
import {
  HabitCompletionError,
  HabitStateError,
  completeHabit,
  createHabit,
  setHabitStatus,
  undoHabitCompletion,
  updateHabit,
} from "./service";

/**
 * Habit server actions.
 *
 * Every action authenticates, then hands the session's `userId` to the
 * service. Nothing here takes a user id from the caller, and the completion
 * actions take a habit id and a day — never an XP amount or a streak.
 */

/** Every surface that draws habits. */
function revalidateHabitViews(habitId?: string): void {
  revalidatePath("/app");
  revalidatePath("/app/today");
  revalidatePath("/app/habits");
  if (habitId) revalidatePath(`/app/habits/${habitId}`);
}

function toErrorState(error: unknown, fallback: string): HabitFormState {
  if (
    error instanceof UnauthorizedError ||
    error instanceof NotFoundError ||
    error instanceof HabitCompletionError ||
    error instanceof HabitStateError
  ) {
    return { status: "error", errors: { _form: error.message }, message: error.message };
  }
  // Logged here, never sent: a Prisma or SQL message is not the user's
  // problem and tells an attacker about the schema.
  console.error("[habits]", fallback, error);
  return { status: "error", errors: { _form: fallback }, message: fallback };
}

async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

const HABIT_STATUSES: readonly HabitStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

export async function createHabitAction(
  _prev: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  try {
    const user = await requireSession();
    const result = validateHabit(formData, getLocalToday(user.timezone));
    if (!result.ok) return { status: "error", errors: result.errors };

    const created = await createHabit(user.id, result.data);
    revalidateHabitViews();
    return { status: "success", message: "Habit created.", createdId: created.id };
  } catch (error) {
    return toErrorState(error, "We could not create that habit. Please try again.");
  }
}

export async function updateHabitAction(
  habitId: string,
  _prev: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  try {
    const user = await requireSession();
    const result = validateHabit(formData, getLocalToday(user.timezone));
    if (!result.ok) return { status: "error", errors: result.errors };

    await updateHabit(user.id, habitId, result.data);
    revalidateHabitViews(habitId);
    return { status: "success", message: "Habit updated." };
  } catch (error) {
    return toErrorState(error, "We could not update that habit. Please try again.");
  }
}

export async function setHabitStatusAction(
  habitId: string,
  status: string,
): Promise<HabitFormState> {
  try {
    const user = await requireSession();
    if (!(HABIT_STATUSES as readonly string[]).includes(status)) {
      return { status: "error", message: "Choose a valid status." };
    }
    const result = await setHabitStatus(
      user.id,
      habitId,
      status as HabitStatus,
      getLocalToday(user.timezone),
    );
    revalidateHabitViews(habitId);
    return {
      status: "success",
      message: result.changed
        ? { ACTIVE: "Habit is active again.", PAUSED: "Habit paused.", ARCHIVED: "Habit archived." }[
            result.status
          ]
        : undefined,
    };
  } catch (error) {
    return toErrorState(error, "We could not change that habit. Please try again.");
  }
}

/**
 * Ticks or unticks one occurrence.
 *
 * `date` is validated as a real calendar day here and again as a scheduled
 * one in the service. `completed` is the desired state, so the same control
 * can toggle both ways; the client never sends what XP the change is worth.
 */
export async function setHabitCompletionAction(
  habitId: string,
  date: string,
  completed: boolean,
): Promise<HabitFormState> {
  try {
    const user = await requireSession();
    if (!isLocalDate(date)) return { status: "error", message: "That is not a valid day." };

    const outcome = completed
      ? await completeHabit(user.id, habitId, date as LocalDate, user.timezone)
      : await undoHabitCompletion(user.id, habitId, date as LocalDate);

    revalidateHabitViews(habitId);
    return {
      status: "success",
      outcome: {
        changed: outcome.changed,
        xpDelta: outcome.xpDelta,
        level: outcome.level,
        leveledUp: outcome.leveledUp,
      },
    };
  } catch (error) {
    return toErrorState(error, "We could not update that habit. Please try again.");
  }
}
