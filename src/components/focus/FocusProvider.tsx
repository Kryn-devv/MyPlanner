"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  cancelFocusAction,
  completeFocusAction,
  pauseFocusAction,
  resumeFocusAction,
  startFocusAction,
  switchFocusAction,
} from "@/lib/focus/actions";
import type { FocusConflict } from "@/lib/focus/form-state";
import { formatTrackedTime } from "@/lib/focus/duration";
import type { ActiveFocusSession } from "@/lib/focus/queries";
import { useToast } from "@/components/ui/Toast";

/**
 * One place the whole app asks about focus.
 *
 * The provider holds the *server's* answer, handed down from the layout on
 * every render, plus the few bits of genuinely local state: which conflict
 * dialog is open, and whether a request is in flight. It deliberately does not
 * keep its own copy of the session that it mutates optimistically — a timer
 * that shows a state the server refused would be worse than one that takes a
 * moment to catch up.
 *
 * Starting is the one exception worth noting: the button disables itself while
 * the request runs, so a double click cannot fire two starts, and the second
 * would be refused by the database anyway.
 */
export interface FocusRequest {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly targetMinutes: number | null;
}

interface FocusContextValue {
  readonly active: ActiveFocusSession | null;
  readonly isPending: boolean;
  /** The task currently in focus, if any — what a Focus button checks. */
  readonly activeTaskId: string | null;
  start: (request: FocusRequest) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  cancel: () => void;
  /** Set when a start was refused because another session is live. */
  readonly conflict: (FocusConflict & { readonly request: FocusRequest }) | null;
  dismissConflict: () => void;
  confirmSwitch: () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({
  active,
  children,
}: {
  active: ActiveFocusSession | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [conflict, setConflict] = useState<
    (FocusConflict & { request: FocusRequest }) | null
  >(null);

  const fail = useCallback(
    (message: string) => push({ tone: "error", message }),
    [push],
  );

  const start = useCallback(
    (request: FocusRequest) => {
      startTransition(async () => {
        const result = await startFocusAction(request.taskId, request.targetMinutes);
        if (result.status === "conflict") {
          setConflict({ ...result.conflict, request });
          return;
        }
        if (result.status === "error") {
          fail(result.message);
          return;
        }
        push({ tone: "success", message: `Focusing on “${request.taskTitle}”.` });
        router.refresh();
      });
    },
    [fail, push, router],
  );

  const transition = useCallback(
    (
      run: (sessionId: string) => Promise<Awaited<ReturnType<typeof pauseFocusAction>>>,
      onSuccess?: () => void,
    ) => {
      if (!active) return;
      const sessionId = active.id;
      startTransition(async () => {
        const result = await run(sessionId);
        if (result.status === "error" || result.status === "conflict") {
          fail(result.status === "error" ? result.message : result.message);
          // The server's answer is the truth; re-read rather than guess.
          router.refresh();
          return;
        }
        onSuccess?.();
        router.refresh();
      });
    },
    [active, fail, router],
  );

  const pause = useCallback(() => transition(pauseFocusAction), [transition]);
  const resume = useCallback(() => transition(resumeFocusAction), [transition]);
  const cancel = useCallback(
    () =>
      transition(cancelFocusAction, () =>
        push({ tone: "success", message: "Focus session discarded." }),
      ),
    [push, transition],
  );

  const complete = useCallback(() => {
    if (!active) return;
    const sessionId = active.id;
    startTransition(async () => {
      const result = await completeFocusAction(sessionId);
      if (result.status !== "completed") {
        fail(
          result.status === "error" || result.status === "conflict"
            ? result.message
            : "We could not finish that session. Please try again.",
        );
        router.refresh();
        return;
      }
      push(
        result.discarded
          ? {
              tone: "error",
              message: "That session was too short to record.",
              detail: "Nothing was added to your tracked focus.",
            }
          : {
              tone: "success",
              message: "Focus session complete.",
              detail: `${formatTrackedTime(result.trackedSeconds)} tracked.`,
            },
      );
      router.refresh();
    });
  }, [active, fail, push, router]);

  const confirmSwitch = useCallback(() => {
    if (!conflict) return;
    const { sessionId, request } = conflict;
    startTransition(async () => {
      const result = await switchFocusAction(sessionId, request.taskId, request.targetMinutes);
      setConflict(null);
      if (result.status === "error" || result.status === "conflict") {
        fail(result.message);
        router.refresh();
        return;
      }
      push({ tone: "success", message: `Focusing on “${request.taskTitle}”.` });
      router.refresh();
    });
  }, [conflict, fail, push, router]);

  const value = useMemo<FocusContextValue>(
    () => ({
      active,
      isPending,
      activeTaskId: active?.task?.id ?? null,
      start,
      pause,
      resume,
      complete,
      cancel,
      conflict,
      dismissConflict: () => setConflict(null),
      confirmSwitch,
    }),
    [active, cancel, complete, confirmSwitch, conflict, isPending, pause, resume, start],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) throw new Error("useFocus must be used inside a FocusProvider.");
  return context;
}
