"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Clock3, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelativeDay, formatTime, type LocalDate } from "@/lib/datetime";
import type { TaskView } from "@/lib/tasks/queries";
import { Button } from "@/components/ui/Button";
import { ProjectChip } from "@/components/projects/ProjectBadges";
import { CategoryBadge } from "./CategoryBadge";
import { PriorityBadge, PriorityRail } from "./PriorityBadge";
import { TaskCheckbox } from "./TaskCheckbox";
import { XpBadge } from "@/components/xp/XpBadge";

/**
 * A single task row.
 *
 * Completed tasks change in four independent ways — a ticked control, a struck
 * title, lowered contrast and a muted XP chip — so the state is never carried
 * by colour alone.
 *
 * The overflow menu is a plain popover rather than a second dialog: a task row
 * having to mount a dialog each would be needless weight on a list of 200.
 */
export interface TaskCardProps {
  task: TaskView;
  today: LocalDate;
  pending?: boolean;
  onToggle: (task: TaskView) => void;
  onEdit?: (task: TaskView) => void;
  onDelete?: (task: TaskView) => void;
  /**
   * The day this list is already grouped by, if any.
   *
   * A task due on that day drops its date chip and keeps only its clock time —
   * "grouped by day" and "happens at 09:00" are different facts, and losing
   * the second makes a timed list unreadable. A task in the list that is *not*
   * due that day keeps its full date chip, because a bare "9:00 AM" with no
   * day attached would say something untrue about it.
   */
  groupedByDate?: LocalDate | null;
  /** Hides the project chip where the surrounding context already states it. */
  hideProject?: boolean;
  className?: string;
}

export function TaskCard({
  task,
  today,
  pending = false,
  onToggle,
  onEdit,
  onDelete,
  groupedByDate = null,
  hideProject = false,
  className,
}: TaskCardProps) {
  const reduceMotion = useReducedMotion();
  const isOverdue = !task.completed && task.dueDate !== null && task.dueDate < today;
  // Only a task actually due on the grouping day may drop its date.
  const isGrouped = groupedByDate !== null && task.dueDate === groupedByDate;

  return (
    <motion.li
      layout={!reduceMotion}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "panel-flush group relative flex items-start gap-3 px-4 py-3 pl-[1.125rem]",
        "transition-colors duration-200 hover:border-line-strong hover:bg-white/[0.015]",
        task.completed && "opacity-55",
        className,
      )}
    >
      <PriorityRail priority={task.priority} />

      <div className="pt-0.5">
        <TaskCheckbox
          completed={task.completed}
          title={task.title}
          pending={pending}
          onToggle={() => onToggle(task)}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug text-ink transition-colors",
            task.completed && "text-ink-muted line-through decoration-ink-faint/60",
          )}
        >
          {task.title}
        </p>

        {task.description && (
          <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-faint">
            {task.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />

          {task.category && <CategoryBadge name={task.category.name} color={task.category.color} />}

          {!hideProject && task.project && (
            <ProjectChip
              name={task.project.name}
              color={task.project.color}
              milestone={task.milestone?.title ?? null}
              href={`/app/projects/${task.project.id}`}
            />
          )}

          {isGrouped && task.dueTime && (
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
              <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="sr-only">At </span>
              <span className="tnum">{formatTime(task.dueTime)}</span>
            </span>
          )}

          {!isGrouped && task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                isOverdue
                  ? "border-critical/30 bg-critical/10 text-critical"
                  : "border-line bg-white/[0.02] text-ink-muted",
              )}
            >
              <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="sr-only">{isOverdue ? "Overdue, due " : "Due "}</span>
              {formatRelativeDay(task.dueDate, today)}
              {task.dueTime && <span className="tnum">· {formatTime(task.dueTime)}</span>}
              {isOverdue && <span className="sr-only"> (overdue)</span>}
            </span>
          )}

          {task.estimatedMinutes !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
              <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="sr-only">Estimated </span>
              {formatDuration(task.estimatedMinutes)}
            </span>
          )}

          <XpBadge amount={task.xpReward} muted={task.completed} />
        </div>
      </div>

      {(onEdit || onDelete) && (
        <TaskMenu task={task} onEdit={onEdit} onDelete={onDelete} />
      )}
    </motion.li>
  );
}

// ---------------------------------------------------------------------------

function TaskMenu({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  onEdit?: (task: TaskView) => void;
  onDelete?: (task: TaskView) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  // Dismiss on outside click or Escape, and return focus to the trigger so the
  // keyboard user is not dropped at the top of the document.
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
        aria-label={`Actions for “${task.title}”`}
        // Hidden until hover on pointer devices, but always reachable by
        // keyboard via focus-within.
        className={cn(
          "h-7 w-7 opacity-0 transition-opacity",
          "group-hover:opacity-100 focus-visible:opacity-100",
          open && "opacity-100",
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={`Actions for ${task.title}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="panel absolute right-0 top-8 z-20 w-40 overflow-hidden bg-overlay p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
          >
            {onEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onEdit(task);
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete(task);
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] text-critical/85 transition-colors hover:bg-critical/10 hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
