"use client";

import { Archive, ArchiveRestore, Pause, Pencil, Play } from "lucide-react";
import type { HabitDetail } from "@/lib/habits/queries";
import { Button } from "@/components/ui/Button";
import { HabitScheduleBadge, HabitStatusBadge, HabitStreakBadge, HabitWeeklyBadge } from "./HabitBadges";
import { HabitCheckbox } from "./HabitCheckbox";
import { useHabitDialogs } from "./HabitDialogProvider";

/**
 * The detail page's title block.
 *
 * A client component because every control on it is a habit mutation, and all
 * of them go through the same provider the list uses — the detail page does
 * not get its own way of ticking or pausing a habit.
 */
export function HabitHeader({ habit, today }: { habit: HabitDetail; today: string }) {
  const { openEditHabit, setStatus, busy } = useHabitDialogs();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <HabitCheckbox habit={habit} today={today} className="mt-1" />

          <div className="min-w-0">
            <p className="eyebrow mb-1.5">Habit</p>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {habit.name}
            </h1>
            {habit.description && (
              <p className="mt-1.5 max-w-prose text-[0.875rem] leading-relaxed text-ink-muted">
                {habit.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditHabit(habit)} disabled={busy}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>

          {habit.status === "ACTIVE" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus(habit, "PAUSED")}
              disabled={busy}
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              Pause
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus(habit, "ACTIVE")}
              disabled={busy}
            >
              {habit.status === "PAUSED" ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {habit.status === "PAUSED" ? "Resume" : "Restore"}
            </Button>
          )}

          {habit.status !== "ARCHIVED" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus(habit, "ARCHIVED")}
              disabled={busy}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Archive
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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

      {habit.status === "PAUSED" && habit.pausedForDays !== null && (
        <p className="rounded-[var(--radius-control)] border border-caution/25 bg-caution/5 px-3 py-2 text-[0.8125rem] text-caution">
          Paused for {habit.pausedForDays} {habit.pausedForDays === 1 ? "day" : "days"}. Paused days
          are not counted as missed, and your streak is waiting where you left it.
        </p>
      )}
    </div>
  );
}
