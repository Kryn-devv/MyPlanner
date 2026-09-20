"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { deleteGoalAction, setGoalStatusAction, setProjectGoalAction } from "@/lib/goals/actions";
import type { GoalFormState } from "@/lib/goals/form-state";
import type { GoalSummaryView, GoalView } from "@/lib/goals/queries";
import type { ProjectOption, ProjectSummaryView } from "@/lib/projects/queries";
import type { GoalStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ConnectProjectForm } from "./ConnectProjectForm";
import { GoalForm } from "./GoalForm";

/**
 * Owns every goal dialog, mounted once in the app shell.
 *
 * Same shape as TaskDialogProvider and ProjectDialogProvider: one dialog
 * instance driven from anywhere, rather than each card mounting its own.
 */

interface GoalDialogContextValue {
  openCreateGoal: () => void;
  openEditGoal: (goal: GoalView) => void;
  confirmDeleteGoal: (goal: GoalSummaryView | GoalView) => void;
  setStatus: (goal: GoalView, status: GoalStatus) => void;

  /** Connect an existing project to a goal. */
  openConnectProject: (goalId: string) => void;
  /** Release a project from whatever goal it is under. */
  releaseProject: (project: ProjectSummaryView) => void;

  /** Projects offered by the connect dialog, resolved once in the app shell. */
  connectableProjects: readonly ProjectOption[];

  busy: boolean;
}

const GoalDialogContext = createContext<GoalDialogContextValue | null>(null);

export function useGoalDialogs(): GoalDialogContextValue {
  const context = useContext(GoalDialogContext);
  if (!context) throw new Error("useGoalDialogs must be used inside a GoalDialogProvider.");
  return context;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; goal: GoalView }
  | { kind: "delete"; goal: GoalSummaryView | GoalView }
  | { kind: "connect"; goalId: string };

export function GoalDialogProvider({
  children,
  connectableProjects = [],
}: {
  children: ReactNode;
  connectableProjects?: readonly ProjectOption[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const close = useCallback(() => setDialog({ kind: "closed" }), []);

  const report = useCallback(
    (result: GoalFormState, fallback: string) => {
      push(
        result.status === "error"
          ? { tone: "error", message: result.errors?._form ?? fallback }
          : { tone: "success", message: result.message ?? "Done." },
      );
      return result.status !== "error";
    },
    [push],
  );

  const openCreateGoal = useCallback(() => setDialog({ kind: "create" }), []);
  const openEditGoal = useCallback((goal: GoalView) => setDialog({ kind: "edit", goal }), []);
  const confirmDeleteGoal = useCallback(
    (goal: GoalSummaryView | GoalView) => setDialog({ kind: "delete", goal }),
    [],
  );
  const openConnectProject = useCallback(
    (goalId: string) => setDialog({ kind: "connect", goalId }),
    [],
  );

  const setStatus = useCallback(
    (goal: GoalView, status: GoalStatus) => {
      startTransition(async () => {
        const result = await setGoalStatusAction(goal.id, status);
        report(result, "We could not update that goal.");
      });
    },
    [report],
  );

  const releaseProject = useCallback(
    (project: ProjectSummaryView) => {
      startTransition(async () => {
        const result = await setProjectGoalAction(project.id, null);
        report(result, "We could not release that project.");
      });
    },
    [report],
  );

  const handleDeleteGoal = useCallback(() => {
    if (dialog.kind !== "delete") return;
    const { goal } = dialog;

    startTransition(async () => {
      const result = await deleteGoalAction(goal.id);
      const ok = report(result, "We could not delete that goal.");
      close();

      // Only navigate when the page we are on has just ceased to exist.
      // Deleting from the list should leave the user on the list.
      if (ok && pathname === `/app/goals/${goal.id}`) router.push("/app/goals");
    });
  }, [dialog, report, close, router, pathname]);

  const handleFormSuccess = useCallback(
    (state: GoalFormState) => {
      close();
      push({ tone: "success", message: state.message ?? "Saved." });
    },
    [close, push],
  );

  const value = useMemo<GoalDialogContextValue>(
    () => ({
      openCreateGoal,
      openEditGoal,
      confirmDeleteGoal,
      setStatus,
      openConnectProject,
      releaseProject,
      connectableProjects,
      busy,
    }),
    [
      openCreateGoal,
      openEditGoal,
      confirmDeleteGoal,
      setStatus,
      openConnectProject,
      releaseProject,
      connectableProjects,
      busy,
    ],
  );

  return (
    <GoalDialogContext.Provider value={value}>
      {children}

      {/* -- goal form -- */}
      <Modal
        open={dialog.kind === "create" || dialog.kind === "edit"}
        onClose={close}
        title={dialog.kind === "edit" ? "Edit goal" : "New goal"}
        description={
          dialog.kind === "edit"
            ? "Changes apply immediately. Connected projects are unaffected."
            : "Name what you are working toward. Projects come next."
        }
        size="lg"
      >
        {(dialog.kind === "create" || dialog.kind === "edit") && (
          <GoalForm
            key={dialog.kind === "edit" ? dialog.goal.id : "create"}
            goal={dialog.kind === "edit" ? dialog.goal : null}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
      </Modal>

      {/* -- connect an existing project -- */}
      <Modal
        open={dialog.kind === "connect"}
        onClose={close}
        title="Connect a project"
        description="Point an existing project at this goal."
      >
        {dialog.kind === "connect" && (
          <ConnectProjectForm
            goalId={dialog.goalId}
            options={connectableProjects}
            onDone={close}
          />
        )}
      </Modal>

      {/* -- delete goal -- */}
      <Modal
        open={dialog.kind === "delete"}
        onClose={close}
        title="Delete this goal?"
        description="Your projects are kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteGoal} loading={busy}>
              Delete goal
            </Button>
          </div>
        }
      >
        {dialog.kind === "delete" && (
          <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
            <p>
              <span className="font-medium text-ink">“{dialog.goal.title}”</span> will be
              permanently removed.
            </p>
            {/* Say plainly what survives — a delete confirmation that leaves
                the user guessing about their work is not a confirmation. */}
            <p className="rounded-[var(--radius-control)] border border-line bg-white/[0.02] px-3 py-2.5 text-[0.8125rem]">
              Projects under this goal are <span className="font-medium text-ink">not</span>{" "}
              deleted. They keep their milestones, tasks and XP, and simply stop belonging to a
              goal.
            </p>
          </div>
        )}
      </Modal>
    </GoalDialogContext.Provider>
  );
}
