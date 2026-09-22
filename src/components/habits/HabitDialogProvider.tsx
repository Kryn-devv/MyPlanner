"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { setHabitCompletionAction, setHabitStatusAction } from "@/lib/habits/actions";
import type { HabitFormState } from "@/lib/habits/form-state";
import type { HabitDayView, HabitView } from "@/lib/habits/queries";
import { formatXpDelta } from "@/lib/xp";
import type { HabitStatus } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { HabitForm } from "./HabitForm";

/**
 * Owns every habit dialog and every habit write the UI can start, mounted once
 * in the app shell.
 *
 * Same shape as the task, project and goal providers: one dialog instance
 * driven from anywhere, so the list, the detail page, Today and the dashboard
 * all tick a habit through the same code path and report it the same way.
 */

interface HabitDialogContextValue {
  openCreateHabit: () => void;
  openEditHabit: (habit: HabitView) => void;
  setStatus: (habit: HabitView, status: HabitStatus) => void;
  /**
   * Ticks or unticks one occurrence. `onRefused` is called when the server
   * did not record the change, so an optimistic control can snap back.
   */
  toggleCompletion: (habit: HabitDayView, next: boolean, onRefused?: () => void) => void;
  busy: boolean;
}

const HabitDialogContext = createContext<HabitDialogContextValue | null>(null);

export function useHabitDialogs(): HabitDialogContextValue {
  const context = useContext(HabitDialogContext);
  if (!context) throw new Error("useHabitDialogs must be used inside a HabitDialogProvider.");
  return context;
}

type DialogState = { kind: "closed" } | { kind: "create" } | { kind: "edit"; habit: HabitView };

export function HabitDialogProvider({ children, today }: { children: ReactNode; today: string }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, startTransition] = useTransition();
  const { push } = useToast();

  const close = useCallback(() => setDialog({ kind: "closed" }), []);

  const openCreateHabit = useCallback(() => setDialog({ kind: "create" }), []);
  const openEditHabit = useCallback((habit: HabitView) => setDialog({ kind: "edit", habit }), []);

  const setStatus = useCallback(
    (habit: HabitView, status: HabitStatus) => {
      startTransition(async () => {
        const result = await setHabitStatusAction(habit.id, status);
        if (result.status === "error") {
          push({
            tone: "error",
            message: result.errors?._form ?? "We could not update that habit.",
          });
          return;
        }
        if (result.message) push({ tone: "success", message: result.message, detail: habit.name });
      });
    },
    [push],
  );

  /**
   * Ticks one occurrence.
   *
   * Not awaited inside the caller's own optimistic update: the row has already
   * drawn the change, and the reward is announced only once the server has
   * actually written it. `changed: false` means the day was already in that
   * state — a duplicate click, or a second tab — and says nothing, because
   * nothing happened.
   *
   * A refusal calls `onRefused`. It has to: the server sends no new data when
   * it rejects a tick, so a control that re-syncs from its props would keep
   * showing a completion that was never recorded.
   */
  const toggleCompletion = useCallback(
    (habit: HabitDayView, next: boolean, onRefused?: () => void) => {
      startTransition(async () => {
        const result = await setHabitCompletionAction(habit.id, habit.date, next);

        if (result.status === "error") {
          onRefused?.();
          push({
            tone: "error",
            message: result.errors?._form ?? result.message ?? "We could not update that habit.",
          });
          return;
        }

        const outcome = result.outcome;
        if (!outcome || !outcome.changed || outcome.xpDelta === 0) return;

        if (outcome.leveledUp) {
          push({
            tone: "xp",
            message: `Level ${outcome.level} reached`,
            detail: `${formatXpDelta(outcome.xpDelta)} · “${habit.name}”`,
          });
        } else {
          push({
            tone: next ? "xp" : "success",
            message: formatXpDelta(outcome.xpDelta),
            detail: habit.name,
          });
        }
      });
    },
    [push],
  );

  const handleFormSuccess = useCallback(
    (state: HabitFormState) => {
      close();
      push({ tone: "success", message: state.message ?? "Saved." });
    },
    [close, push],
  );

  const value = useMemo<HabitDialogContextValue>(
    () => ({ openCreateHabit, openEditHabit, setStatus, toggleCompletion, busy }),
    [openCreateHabit, openEditHabit, setStatus, toggleCompletion, busy],
  );

  return (
    <HabitDialogContext.Provider value={value}>
      {children}

      <Modal
        open={dialog.kind === "create" || dialog.kind === "edit"}
        onClose={close}
        title={dialog.kind === "edit" ? "Edit habit" : "New habit"}
        description={
          dialog.kind === "edit"
            ? "Changes apply from here on. Days you have already kept are untouched."
            : "Something small and repeatable. The streak comes from doing it, not from planning it."
        }
        size="lg"
      >
        {(dialog.kind === "create" || dialog.kind === "edit") && (
          <HabitForm
            key={dialog.kind === "edit" ? dialog.habit.id : "create"}
            habit={dialog.kind === "edit" ? dialog.habit : null}
            today={today}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
      </Modal>
    </HabitDialogContext.Provider>
  );
}
