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
import {
  deleteMilestoneAction,
  deleteProjectAction,
  setMilestoneStatusAction,
  setProjectStatusAction,
} from "@/lib/projects/actions";
import type { ProjectFormState } from "@/lib/projects/form-state";
import type { MilestoneView, ProjectSummaryView, ProjectView } from "@/lib/projects/queries";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { MilestoneForm } from "./MilestoneForm";
import { ProjectForm } from "./ProjectForm";

/**
 * Owns every project and milestone dialog.
 *
 * Mounted once in the app shell, like TaskDialogProvider, so the Quick Add
 * menu in the header, a project card's overflow menu and the detail page all
 * drive the same dialog instance.
 */

interface ProjectDialogContextValue {
  openCreateProject: () => void;
  openEditProject: (project: ProjectView) => void;
  confirmDeleteProject: (project: ProjectSummaryView | ProjectView) => void;
  setStatus: (project: ProjectView, status: ProjectStatus) => void;

  openCreateMilestone: (projectId: string) => void;
  openEditMilestone: (milestone: MilestoneView) => void;
  confirmDeleteMilestone: (milestone: MilestoneView) => void;
  toggleMilestone: (milestone: MilestoneView) => void;

  busy: boolean;
}

const ProjectDialogContext = createContext<ProjectDialogContextValue | null>(null);

export function useProjectDialogs(): ProjectDialogContextValue {
  const context = useContext(ProjectDialogContext);
  if (!context) throw new Error("useProjectDialogs must be used inside a ProjectDialogProvider.");
  return context;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "create-project" }
  | { kind: "edit-project"; project: ProjectView }
  | { kind: "delete-project"; project: ProjectSummaryView | ProjectView }
  | { kind: "create-milestone"; projectId: string }
  | { kind: "edit-milestone"; milestone: MilestoneView }
  | { kind: "delete-milestone"; milestone: MilestoneView };

export function ProjectDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const close = useCallback(() => setDialog({ kind: "closed" }), []);

  const report = useCallback(
    (result: ProjectFormState, fallback: string) => {
      push(
        result.status === "error"
          ? { tone: "error", message: result.errors?._form ?? fallback }
          : { tone: "success", message: result.message ?? "Done." },
      );
      return result.status !== "error";
    },
    [push],
  );

  // -- projects -------------------------------------------------------------
  const openCreateProject = useCallback(() => setDialog({ kind: "create-project" }), []);
  const openEditProject = useCallback(
    (project: ProjectView) => setDialog({ kind: "edit-project", project }),
    [],
  );
  const confirmDeleteProject = useCallback(
    (project: ProjectSummaryView | ProjectView) => setDialog({ kind: "delete-project", project }),
    [],
  );

  const setStatus = useCallback(
    (project: ProjectView, status: ProjectStatus) => {
      startTransition(async () => {
        const result = await setProjectStatusAction(project.id, status);
        report(result, "We could not update that project.");
      });
    },
    [report],
  );

  const handleDeleteProject = useCallback(() => {
    if (dialog.kind !== "delete-project") return;
    const { project } = dialog;

    startTransition(async () => {
      const result = await deleteProjectAction(project.id);
      const ok = report(result, "We could not delete that project.");
      close();

      // Only navigate when the page we are on has just ceased to exist.
      // Deleting from the list should leave the user on the list.
      if (ok && pathname === `/app/projects/${project.id}`) {
        router.push("/app/projects");
      }
    });
  }, [dialog, report, close, router, pathname]);

  // -- milestones -----------------------------------------------------------
  const openCreateMilestone = useCallback(
    (projectId: string) => setDialog({ kind: "create-milestone", projectId }),
    [],
  );
  const openEditMilestone = useCallback(
    (milestone: MilestoneView) => setDialog({ kind: "edit-milestone", milestone }),
    [],
  );
  const confirmDeleteMilestone = useCallback(
    (milestone: MilestoneView) => setDialog({ kind: "delete-milestone", milestone }),
    [],
  );

  const toggleMilestone = useCallback(
    (milestone: MilestoneView) => {
      startTransition(async () => {
        const result = await setMilestoneStatusAction(
          milestone.id,
          milestone.status !== "COMPLETED",
          milestone.projectId,
        );
        report(result, "We could not update that milestone.");
      });
    },
    [report],
  );

  const handleDeleteMilestone = useCallback(() => {
    if (dialog.kind !== "delete-milestone") return;
    const { milestone } = dialog;

    startTransition(async () => {
      const result = await deleteMilestoneAction(milestone.id, milestone.projectId);
      report(result, "We could not delete that milestone.");
      close();
    });
  }, [dialog, report, close]);

  const handleFormSuccess = useCallback(
    (state: ProjectFormState) => {
      close();
      push({ tone: "success", message: state.message ?? "Saved." });
    },
    [close, push],
  );

  const value = useMemo<ProjectDialogContextValue>(
    () => ({
      openCreateProject,
      openEditProject,
      confirmDeleteProject,
      setStatus,
      openCreateMilestone,
      openEditMilestone,
      confirmDeleteMilestone,
      toggleMilestone,
      busy,
    }),
    [
      openCreateProject,
      openEditProject,
      confirmDeleteProject,
      setStatus,
      openCreateMilestone,
      openEditMilestone,
      confirmDeleteMilestone,
      toggleMilestone,
      busy,
    ],
  );

  return (
    <ProjectDialogContext.Provider value={value}>
      {children}

      {/* -- project form -- */}
      <Modal
        open={dialog.kind === "create-project" || dialog.kind === "edit-project"}
        onClose={close}
        title={dialog.kind === "edit-project" ? "Edit project" : "New project"}
        description={
          dialog.kind === "edit-project"
            ? "Changes apply immediately. Tasks and milestones are unaffected."
            : "Name it, then add milestones and tasks inside."
        }
        size="lg"
      >
        {(dialog.kind === "create-project" || dialog.kind === "edit-project") && (
          <ProjectForm
            key={dialog.kind === "edit-project" ? dialog.project.id : "create"}
            project={dialog.kind === "edit-project" ? dialog.project : null}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
      </Modal>

      {/* -- milestone form -- */}
      <Modal
        open={dialog.kind === "create-milestone" || dialog.kind === "edit-milestone"}
        onClose={close}
        title={dialog.kind === "edit-milestone" ? "Edit milestone" : "Add milestone"}
        description="A checkpoint within this project."
      >
        {dialog.kind === "create-milestone" && (
          <MilestoneForm
            key="create-milestone"
            projectId={dialog.projectId}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
        {dialog.kind === "edit-milestone" && (
          <MilestoneForm
            key={dialog.milestone.id}
            projectId={dialog.milestone.projectId}
            milestone={dialog.milestone}
            onSuccess={handleFormSuccess}
            onCancel={close}
          />
        )}
      </Modal>

      {/* -- delete project -- */}
      <Modal
        open={dialog.kind === "delete-project"}
        onClose={close}
        title="Delete this project?"
        description="Your tasks are kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteProject} loading={busy}>
              Delete project
            </Button>
          </div>
        }
      >
        {dialog.kind === "delete-project" && (
          <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
            <p>
              <span className="font-medium text-ink">“{dialog.project.name}”</span> and its
              milestones will be permanently removed.
            </p>
            {/* Say plainly what survives — a delete confirmation that leaves
                the user guessing about their tasks is not a confirmation. */}
            <p className="rounded-[var(--radius-control)] border border-line bg-white/[0.02] px-3 py-2.5 text-[0.8125rem]">
              Tasks in this project are <span className="font-medium text-ink">not</span> deleted.
              They stay in your task list, along with any XP they earned, and simply stop belonging
              to a project.
            </p>
          </div>
        )}
      </Modal>

      {/* -- delete milestone -- */}
      <Modal
        open={dialog.kind === "delete-milestone"}
        onClose={close}
        title="Delete this milestone?"
        description="Its tasks stay in the project."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteMilestone} loading={busy}>
              Delete milestone
            </Button>
          </div>
        }
      >
        {dialog.kind === "delete-milestone" && (
          <p className="text-sm leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">“{dialog.milestone.title}”</span> will be
            removed. Its tasks remain in the project, no longer grouped under a milestone.
          </p>
        )}
      </Modal>
    </ProjectDialogContext.Provider>
  );
}
