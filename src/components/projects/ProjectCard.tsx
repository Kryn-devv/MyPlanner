"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Flag,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatRelativeDay, type LocalDate } from "@/lib/datetime";
import type { ProjectSummaryView } from "@/lib/projects/queries";
import { suggestsCompletion } from "@/lib/projects/progress";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { ProjectMark, ProjectStatusBadge } from "./ProjectBadges";
import { ProjectProgress } from "./ProjectProgress";
import { useProjectDialogs } from "./ProjectDialogProvider";

/**
 * A project in the list.
 *
 * The whole card is a link to the detail page; the overflow menu sits above it
 * and stops propagation, so the common action (open it) needs no aiming while
 * the rarer ones stay one click away. Progressive disclosure keeps the card
 * readable — status, progress and deadline are always visible, everything else
 * is in the menu.
 */
export function ProjectCard({
  project,
  today,
  className,
}: {
  project: ProjectSummaryView;
  today: LocalDate;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { openEditProject, confirmDeleteProject, setStatus } = useProjectDialogs();
  const canSuggestCompletion = suggestsCompletion(project.progress, project.status);

  return (
    <motion.li
      layout={!reduceMotion}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "panel group relative overflow-hidden transition-colors duration-200 hover:border-line-strong",
        project.status === "ARCHIVED" && "opacity-65",
        className,
      )}
    >
      <Link
        href={`/app/projects/${project.id}`}
        className="block p-4 focus-visible:outline-none"
        aria-label={`Open ${project.name}`}
      >
        <div className="flex items-start gap-3">
          <ProjectMark color={project.color} />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="truncate text-[0.9375rem] font-medium leading-snug text-ink">
                {project.name}
              </h3>
              {/* Spacer so the title never runs under the menu button. */}
              <span aria-hidden="true" className="h-7 w-7 shrink-0" />
            </div>

            {project.description && (
              <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-faint">
                {project.description}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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

              {project.milestoneCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
                  <Flag className="h-2.5 w-2.5" aria-hidden="true" />
                  <span className="tnum">
                    {project.completedMilestoneCount}/{project.milestoneCount}
                  </span>
                  <span className="sr-only"> milestones complete</span>
                  <span aria-hidden="true">milestones</span>
                </span>
              )}
            </div>

            <ProjectProgress
              progress={project.progress}
              label={`${project.name} progress`}
              className="mt-3.5"
            />

            {canSuggestCompletion && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[0.75rem] text-positive">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                All tasks complete
              </p>
            )}
          </div>
        </div>
      </Link>

      <ProjectMenu project={project} onEdit={openEditProject} onDelete={confirmDeleteProject} onStatus={setStatus} />
    </motion.li>
  );
}

// ---------------------------------------------------------------------------

function ProjectMenu({
  project,
  onEdit,
  onDelete,
  onStatus,
}: {
  project: ProjectSummaryView;
  onEdit: (project: ProjectSummaryView) => void;
  onDelete: (project: ProjectSummaryView) => void;
  onStatus: (project: ProjectSummaryView, status: "ACTIVE" | "COMPLETED" | "ARCHIVED") => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="absolute right-3 top-3 z-10">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        // The card is a link, so the menu must not navigate.
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${project.name}`}
        className={cn(
          "h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          open && "opacity-100",
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${project.name}`}
          className="panel absolute right-0 top-8 w-48 overflow-hidden bg-overlay p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
        >
          <MenuItem icon={Pencil} label="Edit" onClick={run(() => onEdit(project))} />

          {project.status !== "COMPLETED" && (
            <MenuItem
              icon={CheckCircle2}
              label="Mark complete"
              onClick={run(() => onStatus(project, "COMPLETED"))}
            />
          )}
          {project.status === "COMPLETED" && (
            <MenuItem icon={RotateCcw} label="Reopen" onClick={run(() => onStatus(project, "ACTIVE"))} />
          )}

          {project.status !== "ARCHIVED" ? (
            <MenuItem icon={Archive} label="Archive" onClick={run(() => onStatus(project, "ARCHIVED"))} />
          ) : (
            <MenuItem
              icon={ArchiveRestore}
              label="Restore"
              onClick={run(() => onStatus(project, "ACTIVE"))}
            />
          )}

          <div role="separator" className="my-1 h-px bg-line" />

          <MenuItem icon={Trash2} label="Delete" destructive onClick={run(() => onDelete(project))} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors",
        destructive
          ? "text-critical/85 hover:bg-critical/10 hover:text-critical"
          : "text-ink-muted hover:bg-white/5 hover:text-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
