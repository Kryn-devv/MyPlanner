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
import { deleteTaskAction, toggleTaskAction } from "@/lib/tasks/actions";
import type { TaskFormState } from "@/lib/tasks/form-state";
import type { ProjectOption } from "@/lib/projects/queries";
import type { CategoryView, TaskView } from "@/lib/tasks/queries";
import { formatXpDelta } from "@/lib/xp";
import type { LocalDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { TaskForm } from "./TaskForm";

/**
 * One place that owns task dialogs and task mutations for the whole app.
 *
 * Mounted once in the app shell, so the Quick Add button in the header, an
 * empty state's call to action and a row's overflow menu all drive the same
 * dialog instance instead of each mounting their own.
 */

/** Pre-selects the project (and optionally milestone) a task is created in. */
export interface TaskCreateDefaults {
  dueDate?: LocalDate | null;
  /**
   * Set when creating from inside a project or milestone, so the user never
   * has to re-pick the context they are already standing in.
   */
  milestone?: { projectId: string; milestoneId: string | null } | null;
}

interface TaskDialogContextValue {
  openCreate: (defaults?: TaskCreateDefaults) => void;
  openEdit: (task: TaskView) => void;
  requestDelete: (task: TaskView) => void;
  /** Toggles completion and surfaces the XP result. */
  toggle: (task: TaskView) => void;
  categories: readonly CategoryView[];
  projects: readonly ProjectOption[];
  today: LocalDate;
}

const TaskDialogContext = createContext<TaskDialogContextValue | null>(null);

export function useTaskDialogs(): TaskDialogContextValue {
  const context = useContext(TaskDialogContext);
  if (!context) throw new Error("useTaskDialogs must be used inside a TaskDialogProvider.");
  return context;
}

type DialogState =
  | { kind: "closed" }
  | {
      kind: "create";
      dueDate: LocalDate | null;
      projectId: string | null;
      milestoneId: string | null;
    }
  | { kind: "edit"; task: TaskView }
  | { kind: "delete"; task: TaskView };

export function TaskDialogProvider({
  categories,
  projects,
  today,
  children,
}: {
  categories: readonly CategoryView[];
  projects: readonly ProjectOption[];
  today: LocalDate;
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [deleting, startDeleting] = useTransition();
  const { push } = useToast();

  const close = useCallback(() => setDialog({ kind: "closed" }), []);

  const openCreate = useCallback((defaults?: TaskCreateDefaults) => {
    setDialog({
      kind: "create",
      dueDate: defaults?.dueDate ?? null,
      projectId: defaults?.milestone?.projectId ?? null,
      milestoneId: defaults?.milestone?.milestoneId ?? null,
    });
  }, []);

  const openEdit = useCallback((task: TaskView) => setDialog({ kind: "edit", task }), []);
  const requestDelete = useCallback((task: TaskView) => setDialog({ kind: "delete", task }), []);

  const toggle = useCallback(
    (task: TaskView) => {
      const nextCompleted = !task.completed;

      // Not awaited: the calling list has already applied its optimistic
      // update, and blocking here would stall the animation.
      void toggleTaskAction(task.id, nextCompleted).then((result) => {
        if (result.status === "error") {
          push({
            tone: "error",
            message: result.errors?._form ?? "We could not update that task.",
          });
          return;
        }

        const delta = result.outcome?.xpDelta ?? 0;
        if (result.outcome?.leveledUp) {
          push({
            tone: "xp",
            message: `Level ${result.outcome.level} reached`,
            detail: `${formatXpDelta(delta)} · “${task.title}”`,
          });
        } else if (delta !== 0) {
          push({
            tone: nextCompleted ? "xp" : "success",
            message: formatXpDelta(delta),
            detail: task.title,
          });
        }
      });
    },
    [push],
  );

  const handleFormSuccess = useCallback(
    (state: TaskFormState) => {
      close();
      push({ tone: "success", message: state.message ?? "Saved." });
    },
    [close, push],
  );

  const confirmDelete = useCallback(() => {
    if (dialog.kind !== "delete") return;
    const { task } = dialog;

    startDeleting(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.status === "error") {
        push({ tone: "error", message: result.errors?._form ?? "We could not delete that task." });
        return;
      }
      close();
      push({ tone: "success", message: "Task deleted", detail: task.title });
    });
  }, [dialog, close, push]);

  const value = useMemo<TaskDialogContextValue>(
    () => ({ openCreate, openEdit, requestDelete, toggle, categories, projects, today }),
    [openCreate, openEdit, requestDelete, toggle, categories, projects, today],
  );

  return (
    <TaskDialogContext.Provider value={value}>
      {children}

      <Modal
        open={dialog.kind === "create" || dialog.kind === "edit"}
        onClose={close}
        title={dialog.kind === "edit" ? "Edit task" : "New task"}
        description={
          dialog.kind === "edit"
            ? "Changes apply immediately. XP already earned is not affected."
            : "Give it a title — everything else is optional."
        }
        size="lg"
      >
        {(dialog.kind === "create" || dialog.kind === "edit") && (
          <TaskForm
            // Remounts between create and edit so the form never shows stale
            // values from a previously opened task.
            key={dialog.kind === "edit" ? dialog.task.id : "create"}
            formId="task-form"
            categories={categories}
            projects={projects}
            task={dialog.kind === "edit" ? dialog.task : null}
            defaultDueDate={dialog.kind === "create" ? dialog.dueDate : null}
            defaultProjectId={dialog.kind === "create" ? dialog.projectId : null}
            defaultMilestoneId={dialog.kind === "create" ? dialog.milestoneId : null}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal
        open={dialog.kind === "delete"}
        onClose={close}
        title="Delete this task?"
        description="This cannot be undone. Any XP it awarded is removed with it."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              Delete task
            </Button>
          </div>
        }
      >
        {dialog.kind === "delete" && (
          <p className="text-sm leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">“{dialog.task.title}”</span> will be permanently
            removed.
          </p>
        )}
      </Modal>
    </TaskDialogContext.Provider>
  );
}
