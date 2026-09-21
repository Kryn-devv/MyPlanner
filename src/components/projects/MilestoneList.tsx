"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatRelativeDay, type LocalDate } from "@/lib/datetime";
import { suggestsCompletion } from "@/lib/projects/progress";
import type { MilestoneView } from "@/lib/projects/queries";
import type { TaskView } from "@/lib/tasks/queries";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { TaskList } from "@/components/tasks/TaskList";
import { useTaskDialogs } from "@/components/tasks/TaskDialogProvider";
import { MilestoneStatusBadge } from "./ProjectBadges";
import { ProjectProgress } from "./ProjectProgress";
import { useProjectDialogs } from "./ProjectDialogProvider";

/**
 * Milestones and the tasks filed under each.
 *
 * Collapsible rather than a stack of large cards: a project with eight
 * milestones should still fit on a screen. Completed milestones start
 * collapsed because they no longer need attention; pending ones start open.
 */
export function MilestoneList({
  projectId,
  milestones,
  tasks,
  today,
}: {
  projectId: string;
  milestones: readonly MilestoneView[];
  tasks: readonly TaskView[];
  today: LocalDate;
}) {
  const { openCreateMilestone } = useProjectDialogs();

  if (milestones.length === 0) {
    return (
      <section aria-labelledby="milestones-heading" className="panel">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="milestones-heading" className="eyebrow">
            Milestones
          </h2>
        </header>
        <EmptyState
          dense
          icon={<Flag />}
          title="No milestones yet."
          description="Break this project into checkpoints to track it in stages."
          action={
            <Button variant="secondary" size="sm" onClick={() => openCreateMilestone(projectId)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add milestone
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="milestones-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="milestones-heading" className="eyebrow">
          Milestones <span className="tnum text-ink-muted">{milestones.length}</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => openCreateMilestone(projectId)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </Button>
      </div>

      <ul className="space-y-2">
        {milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.id}
            milestone={milestone}
            tasks={tasks.filter((t) => t.milestoneId === milestone.id)}
            today={today}
          />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function MilestoneCard({
  milestone,
  tasks,
  today,
}: {
  milestone: MilestoneView;
  tasks: readonly TaskView[];
  today: LocalDate;
}) {
  const isDone = milestone.status === "COMPLETED";
  const [open, setOpen] = useState(!isDone);
  const reduceMotion = useReducedMotion();
  const { toggleMilestone, busy } = useProjectDialogs();
  const { openCreate } = useTaskDialogs();
  const canSuggestCompletion = suggestsCompletion(milestone.progress, milestone.status);

  const panelId = `milestone-panel-${milestone.id}`;

  return (
    <motion.li
      layout={!reduceMotion}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn("panel overflow-hidden", isDone && "opacity-75")}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Completing a milestone is a decision, so it gets a real toggle
            button — never inferred from its tasks. */}
        <button
          type="button"
          onClick={() => toggleMilestone(milestone)}
          disabled={busy}
          aria-pressed={isDone}
          aria-label={
            isDone ? `Reopen milestone ${milestone.title}` : `Complete milestone ${milestone.title}`
          }
          className={cn(
            "mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-all duration-200",
            "hover:scale-110 active:scale-95 disabled:cursor-wait disabled:opacity-60",
            isDone
              ? "border-positive/60 bg-positive/20"
              : "border-line-strong bg-white/[0.02] hover:border-accent/60 hover:bg-accent/10",
          )}
        >
          {isDone && <Check className="h-3 w-3 text-positive" strokeWidth={3.5} aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            className="group/toggle flex w-full items-center gap-2 text-left"
          >
            <span
              className={cn(
                "truncate text-[0.875rem] font-medium text-ink",
                isDone && "text-ink-muted line-through decoration-ink-faint/60",
              )}
            >
              {milestone.title}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>

          {milestone.description && (
            <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-faint">
              {milestone.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MilestoneStatusBadge status={milestone.status} />

            {milestone.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                  milestone.isOverdue
                    ? "border-critical/30 bg-critical/10 text-critical"
                    : "border-line bg-white/[0.02] text-ink-muted",
                )}
              >
                <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
                <span className="sr-only">{milestone.isOverdue ? "Overdue, due " : "Due "}</span>
                {formatRelativeDay(milestone.dueDate, today)}
              </span>
            )}
          </div>

          <ProjectProgress
            progress={milestone.progress}
            label={`${milestone.title} progress`}
            className="mt-3 max-w-sm"
          />

          {canSuggestCompletion && (
            <p className="mt-2 text-[0.75rem] text-positive">
              All milestone tasks complete —{" "}
              <button
                type="button"
                onClick={() => toggleMilestone(milestone)}
                disabled={busy}
                className="font-medium underline underline-offset-4 hover:text-positive/80"
              >
                complete milestone
              </button>
            </p>
          )}
        </div>

        <MilestoneMenu milestone={milestone} />
      </div>

      {open && (
        <div id={panelId} className="border-t border-line bg-base/40 p-3">
          {tasks.length === 0 ? (
            <EmptyState
              dense
              title="No tasks in this milestone."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openCreate({ milestone: { projectId: milestone.projectId, milestoneId: milestone.id } })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add task
                </Button>
              }
            />
          ) : (
            <>
              <TaskList tasks={tasks} hideProject showFocus />
              <div className="mt-2 flex justify-start">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openCreate({ milestone: { projectId: milestone.projectId, milestoneId: milestone.id } })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add task
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </motion.li>
  );
}

function MilestoneMenu({ milestone }: { milestone: MilestoneView }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { openEditMilestone, confirmDeleteMilestone } = useProjectDialogs();

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

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for milestone ${milestone.title}`}
        className="h-7 w-7"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${milestone.title}`}
          className="panel absolute right-0 top-8 z-20 w-40 overflow-hidden bg-overlay p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openEditMilestone(milestone);
            }}
            className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              confirmDeleteMilestone(milestone);
            }}
            className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] text-critical/85 transition-colors hover:bg-critical/10 hover:text-critical"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
