"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { NotFoundError, UnauthorizedError } from "@/lib/auth/guard";
import { ActiveSessionConflictError, InvalidTransitionError } from "./errors";
import {
  cancelFocusSession,
  completeFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  switchFocusSession,
} from "./service";
import type { FocusActionState } from "./form-state";

/**
 * Focus server actions.
 *
 * Every one of them takes ids and nothing else. There is deliberately no
 * parameter anywhere in this file that carries a duration, a timestamp or a
 * user id: the browser asks for a transition, the server decides what time it
 * is and who is asking. That is the whole reason a tampered client cannot
 * inflate tracked focus.
 */

/** Surfaces that change when a session starts or ends. */
function revalidateFocusViews(): void {
  // The shell reads the active session on every page, so the whole protected
  // area is invalidated rather than just the focus route.
  revalidatePath("/app", "layout");
}

function toErrorState(error: unknown, fallback: string): FocusActionState {
  if (error instanceof ActiveSessionConflictError) {
    return {
      status: "conflict",
      conflict: { sessionId: error.activeSessionId, taskTitle: error.activeTaskTitle },
      message: error.message,
    };
  }
  if (error instanceof InvalidTransitionError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
    return { status: "error", message: error.message };
  }
  // Logged here, never sent: a Prisma or SQL message is not the user's problem
  // and tells an attacker about the schema.
  console.error("[focus]", fallback, error);
  return { status: "error", message: fallback };
}

async function requireId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

export async function startFocusAction(
  taskId: string,
  targetMinutes: number | null,
): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const session = await startFocusSession(userId, { taskId, targetMinutes });
    revalidateFocusViews();
    return { status: "success", sessionId: session.id, sessionStatus: session.status };
  } catch (error) {
    return toErrorState(error, "We could not start that focus session. Please try again.");
  }
}

export async function pauseFocusAction(sessionId: string): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const session = await pauseFocusSession(userId, sessionId);
    revalidateFocusViews();
    return { status: "success", sessionId: session.id, sessionStatus: session.status };
  } catch (error) {
    return toErrorState(error, "We could not pause that session. Please try again.");
  }
}

export async function resumeFocusAction(sessionId: string): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const session = await resumeFocusSession(userId, sessionId);
    revalidateFocusViews();
    return { status: "success", sessionId: session.id, sessionStatus: session.status };
  } catch (error) {
    return toErrorState(error, "We could not resume that session. Please try again.");
  }
}

export async function completeFocusAction(sessionId: string): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const outcome = await completeFocusSession(userId, sessionId);
    revalidateFocusViews();
    return {
      status: "completed",
      sessionId: outcome.sessionId,
      trackedSeconds: outcome.trackedSeconds,
      discarded: outcome.discarded,
    };
  } catch (error) {
    return toErrorState(error, "We could not finish that session. Please try again.");
  }
}

export async function cancelFocusAction(sessionId: string): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const session = await cancelFocusSession(userId, sessionId);
    revalidateFocusViews();
    return { status: "success", sessionId: session.id, sessionStatus: session.status };
  } catch (error) {
    return toErrorState(error, "We could not cancel that session. Please try again.");
  }
}

/**
 * Leaves the current session and starts one on another task.
 *
 * Only ever reached from an explicit confirmation — the conflict state names
 * what is currently in focus and the user chooses. Nothing here happens as a
 * side effect of clicking "Focus" on a second task.
 */
export async function switchFocusAction(
  fromSessionId: string,
  taskId: string,
  targetMinutes: number | null,
): Promise<FocusActionState> {
  try {
    const userId = await requireId();
    const session = await switchFocusSession(userId, fromSessionId, { taskId, targetMinutes });
    revalidateFocusViews();
    return { status: "success", sessionId: session.id, sessionStatus: session.status };
  } catch (error) {
    return toErrorState(error, "We could not switch focus. Please try again.");
  }
}
