"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { suggestsGoalCompletion } from "@/lib/goals/progress";
import type { GoalSummaryView } from "@/lib/goals/queries";
import type { GoalStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { GoalStatusBadge, GoalTargetBadge } from "./GoalBadges";
import { GoalProgress } from "./GoalProgress";
import { useGoalDialogs } from "./GoalDialogProvider";

/**
 * A goal in the list.
 *
 * Reads as a strategic objective rather than another task row: the title
 * carries more weight, the target date is stated in plain words ("27 days
 * remaining"), and the numbers underneath are about accumulated work rather
 * than a single item. The whole card links to the detail page; the overflow
 * menu sits above it and stops propagation.
 */
export function GoalCard({ goal, className }: { goal: GoalSummaryView; className?: string }) {
  const reduceMotion = useReducedMotion();
  const { openEditGoal, confirmDeleteGoal, setStatus } = useGoalDialogs();
  const canSuggestCompletion = suggestsGoalCompletion(goal.progress, goal.status);

  return (
    <motion.li
      layout={!reduceMotion}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "panel group relative overflow-hidden transition-colors duration-200 hover:border-line-strong",
        goal.status === "ARCHIVED" && "opacity-65",
        className,
      )}
    >
      <Link
        href={`/app/goals/${goal.id}`}
        className="block p-4 focus-visible:outline-none"
        aria-label={`Open ${goal.title}`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-accent/20 bg-accent/10"
          >
            <Target className="h-3.5 w-3.5 text-accent-strong" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[0.9375rem] font-medium leading-snug text-ink">{goal.title}</h3>
              {/* Spacer so the title never runs under the menu button. */}
              <span aria-hidden="true" className="h-7 w-7 shrink-0" />
            </div>

            {goal.description && (
              <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-faint">
                {goal.description}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <GoalStatusBadge status={goal.status} />
              <PriorityBadge priority={goal.priority} />
              <GoalTargetBadge timing={goal.timing} />

              {goal.progress.projectCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">
                  <FolderKanban className="h-2.5 w-2.5" aria-hidden="true" />
                  <span className="tnum">{goal.progress.projectCount}</span>
                  {goal.progress.projectCount === 1 ? "project" : "projects"}
                </span>
              )}
            </div>

            <GoalProgress
              progress={goal.progress}
              label={`${goal.title} progress`}
              className="mt-3.5"
            />

            {canSuggestCompletion && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[0.75rem] text-positive">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                All connected work is complete
              </p>
            )}
          </div>
        </div>
      </Link>

      <GoalMenu goal={goal} onEdit={openEditGoal} onDelete={confirmDeleteGoal} onStatus={setStatus} />
    </motion.li>
  );
}

// ---------------------------------------------------------------------------

function GoalMenu({
  goal,
  onEdit,
  onDelete,
  onStatus,
}: {
  goal: GoalSummaryView;
  onEdit: (goal: GoalSummaryView) => void;
  onDelete: (goal: GoalSummaryView) => void;
  onStatus: (goal: GoalSummaryView, status: GoalStatus) => void;
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
        aria-label={`Actions for ${goal.title}`}
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
          aria-label={`Actions for ${goal.title}`}
          className="panel absolute right-0 top-8 w-48 overflow-hidden bg-overlay p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
        >
          <MenuItem icon={Pencil} label="Edit" onClick={run(() => onEdit(goal))} />

          {goal.status !== "COMPLETED" ? (
            <MenuItem
              icon={CheckCircle2}
              label="Mark achieved"
              onClick={run(() => onStatus(goal, "COMPLETED"))}
            />
          ) : (
            <MenuItem icon={RotateCcw} label="Reopen" onClick={run(() => onStatus(goal, "ACTIVE"))} />
          )}

          {goal.status !== "ARCHIVED" ? (
            <MenuItem icon={Archive} label="Archive" onClick={run(() => onStatus(goal, "ARCHIVED"))} />
          ) : (
            <MenuItem
              icon={ArchiveRestore}
              label="Restore"
              onClick={run(() => onStatus(goal, "ACTIVE"))}
            />
          )}

          <div role="separator" className="my-1 h-px bg-line" />

          <MenuItem icon={Trash2} label="Delete" destructive onClick={run(() => onDelete(goal))} />
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
