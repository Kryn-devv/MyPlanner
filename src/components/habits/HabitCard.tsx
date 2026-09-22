"use client";

import type { Route } from "next";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, MoreHorizontal, Pause, Pencil, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { HabitSummaryView } from "@/lib/habits/queries";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  HabitScheduleBadge,
  HabitStatusBadge,
  HabitStreakBadge,
  HabitWeeklyBadge,
} from "./HabitBadges";
import { HabitCheckbox } from "./HabitCheckbox";
import { useHabitDialogs } from "./HabitDialogProvider";

/**
 * A habit in the list.
 *
 * Reads as a practice rather than a task: the tick is the loudest thing on the
 * card, the streak sits next to it, and the month's rate underneath says how
 * it has actually been going. The card links to the detail page; the tick and
 * the overflow menu sit above that link and stop propagation.
 */
export function HabitCard({ habit, today }: { habit: HabitSummaryView; today: string }) {
  const reduceMotion = useReducedMotion();
  const { openEditHabit, setStatus } = useHabitDialogs();

  return (
    <motion.li
      layout={!reduceMotion}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "panel group relative overflow-hidden transition-colors duration-200 hover:border-line-strong",
        habit.status === "ARCHIVED" && "opacity-65",
      )}
    >
      <Link
        href={`/app/habits/${habit.id}` as Route}
        className="block p-4 focus-visible:outline-none"
        aria-label={`Open ${habit.name}`}
      >
        <div className="flex items-start gap-3">
          {/* Spacer under the real control, which is a sibling of the link:
              a button inside an anchor is not valid, and nesting the two
              would make Enter on the row tick the habit. */}
          <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3
                className={cn(
                  "text-[0.9375rem] font-medium leading-snug text-ink",
                  habit.completed && "text-ink-muted",
                )}
              >
                {habit.name}
              </h3>
              <span aria-hidden="true" className="h-7 w-7 shrink-0" />
            </div>

            {habit.description && (
              <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-faint">
                {habit.description}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <HabitStatusBadge status={habit.status} />
              <HabitScheduleBadge
                frequency={habit.frequency}
                weekdays={habit.weekdays}
                weeklyTarget={habit.weeklyTarget}
              />
              <HabitStreakBadge
                streaks={habit.streaks}
                unit={habit.frequency === "WEEKLY" ? "week" : "day"}
              />
              <HabitWeeklyBadge weekly={habit.weekly} />
            </div>

            <div className="mt-3.5">
              <ProgressBar
                value={habit.rate30.percent}
                tone="positive"
                size="sm"
                label={`${habit.name}: last 30 days`}
                valueText={
                  habit.rate30.scheduled === 0
                    ? "Nothing due yet"
                    : `${habit.rate30.completed} of ${habit.rate30.scheduled} kept`
                }
              />
              <p className="mt-1.5 flex items-center justify-between text-[0.75rem] text-ink-faint">
                <span>Last 30 days</span>
                <span className="tnum">
                  {habit.rate30.scheduled === 0
                    ? "—"
                    : `${habit.rate30.completed}/${habit.rate30.scheduled} · ${habit.rate30.percent}%`}
                </span>
              </p>
            </div>

            {habit.status === "PAUSED" && habit.pausedForDays !== null && (
              <p className="mt-2.5 text-[0.75rem] text-caution">
                Paused for {habit.pausedForDays} {habit.pausedForDays === 1 ? "day" : "days"} — these
                days are not counted as missed.
              </p>
            )}
          </div>
        </div>
      </Link>

      <div className="absolute left-4 top-[1.15rem] z-10">
        <HabitCheckbox habit={habit} today={today} />
      </div>

      <HabitMenu habit={habit} onEdit={openEditHabit} onStatus={setStatus} />
    </motion.li>
  );
}

// ---------------------------------------------------------------------------

function HabitMenu({
  habit,
  onEdit,
  onStatus,
}: {
  habit: HabitSummaryView;
  onEdit: (habit: HabitSummaryView) => void;
  onStatus: (habit: HabitSummaryView, status: "ACTIVE" | "PAUSED" | "ARCHIVED") => void;
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${habit.name}`}
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
          aria-label={`Actions for ${habit.name}`}
          className="panel absolute right-0 top-8 w-52 overflow-hidden bg-overlay p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
        >
          <MenuItem icon={Pencil} label="Edit" onClick={run(() => onEdit(habit))} />

          {habit.status === "ACTIVE" && (
            <MenuItem icon={Pause} label="Pause" onClick={run(() => onStatus(habit, "PAUSED"))} />
          )}
          {habit.status !== "ACTIVE" && (
            <MenuItem
              icon={habit.status === "PAUSED" ? Play : ArchiveRestore}
              label={habit.status === "PAUSED" ? "Resume" : "Restore"}
              onClick={run(() => onStatus(habit, "ACTIVE"))}
            />
          )}
          {habit.status !== "ARCHIVED" && (
            <MenuItem
              icon={Archive}
              label="Archive"
              onClick={run(() => onStatus(habit, "ARCHIVED"))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8125rem] text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
