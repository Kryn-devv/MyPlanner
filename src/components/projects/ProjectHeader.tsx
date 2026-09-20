"use client";

import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore, CalendarClock, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeDay, type LocalDate } from "@/lib/datetime";
import { suggestsCompletion } from "@/lib/projects/progress";
import type { ProjectSummaryView } from "@/lib/projects/queries";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { GoalChip } from "@/components/goals/GoalBadges";
import { ProjectMark, ProjectStatusBadge } from "./ProjectBadges";
import { useProjectDialogs } from "./ProjectDialogProvider";

/**
 * The project detail header — identity, state and the actions for this one
 * piece of work.
 *
 * When every task is done the header offers to complete the project, but never
 * does it automatically: "all tasks ticked" and "this project is finished" are
 * different claims, and only the user can make the second one.
 */
export function ProjectHeader({
  project,
  today,
}: {
  project: ProjectSummaryView;
  today: LocalDate;
}) {
  const { openEditProject, confirmDeleteProject, setStatus, openCreateMilestone, busy } =
    useProjectDialogs();

  const canSuggestCompletion = suggestsCompletion(project.progress, project.status);

  return (
    <header className="space-y-4">
      <Link
        href="/app/projects"
        className="inline-flex items-center gap-1.5 rounded text-[0.75rem] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        All projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ProjectMark color={project.color} size="lg" className="mt-0.5" />

          <div className="min-w-0">
            {/* Compact, above the title: context, not a demotion. The project
                remains its own object. */}
            {project.goal ? (
              <div className="mb-1.5">
                <GoalChip goalId={project.goal.id} title={project.goal.title} />
              </div>
            ) : (
              <p className="eyebrow mb-1.5">No goal</p>
            )}

            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {project.name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ProjectStatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />

              {project.dueDate && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                    project.isOverdue
                      ? "border-critical/30 bg-critical/10 text-critical"
                      : "border-line bg-white/[0.02] text-ink-muted",
                  )}
                >
                  <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
                  <span className="sr-only">{project.isOverdue ? "Overdue, due " : "Due "}</span>
                  {formatRelativeDay(project.dueDate, today)}
                  {project.isOverdue && <span className="sr-only"> (overdue)</span>}
                </span>
              )}

              {project.startDate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
                  <span className="sr-only">Started </span>
                  From {formatRelativeDay(project.startDate, today)}
                </span>
              )}
            </div>

            {project.description && (
              <p className="mt-3 max-w-2xl text-[0.875rem] leading-relaxed text-ink-muted">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Full width on mobile so the action row wraps onto its own line —
            `shrink-0` alone pushes it past the viewport at ~390px. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <Button variant="secondary" size="sm" onClick={() => openCreateMilestone(project.id)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Milestone
          </Button>

          <Button variant="ghost" size="sm" onClick={() => openEditProject(project)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>

          {project.status === "COMPLETED" ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStatus(project, "ACTIVE")}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reopen
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setStatus(project, "COMPLETED")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Complete
            </Button>
          )}

          {project.status === "ARCHIVED" ? (
            <Button variant="ghost" size="icon" aria-label="Restore project" disabled={busy} onClick={() => setStatus(project, "ACTIVE")}>
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Archive project" disabled={busy} onClick={() => setStatus(project, "ARCHIVED")}>
              <Archive className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete project"
            onClick={() => confirmDeleteProject(project)}
          >
            <Trash2 className="h-4 w-4 text-critical/80" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {canSuggestCompletion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-positive/25 bg-positive/[0.07] px-3.5 py-2.5">
          <p className="inline-flex items-center gap-2 text-[0.8125rem] text-positive">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            All {project.progress.total} tasks in this project are complete.
          </p>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus(project, "COMPLETED")}>
            Complete project
          </Button>
        </div>
      )}
    </header>
  );
}
