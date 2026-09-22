"use client";

import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { HabitDayView } from "@/lib/habits/queries";
import { HabitScheduleBadge, HabitStreakBadge, HabitWeeklyBadge } from "./HabitBadges";
import { HabitCheckbox } from "./HabitCheckbox";

/**
 * One habit on a day — the row Today and the dashboard draw.
 *
 * Compact on purpose: on those pages a habit is a single decision ("did I do
 * this?"), not an object to inspect, so the row carries the tick, the name,
 * the streak and nothing else. The name links through to the full history.
 */
export function HabitRow({
  habit,
  today,
  compact = false,
}: {
  habit: HabitDayView;
  today: string;
  compact?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] border border-transparent px-2 py-2 transition-colors hover:border-line hover:bg-white/[0.02]",
        compact && "py-1.5",
      )}
    >
      <HabitCheckbox habit={habit} today={today} />

      <div className="min-w-0 flex-1">
        <Link
          href={`/app/habits/${habit.id}` as Route}
          className="block truncate rounded text-[0.875rem] text-ink transition-colors hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className={cn(habit.completed && "text-ink-muted line-through decoration-ink-faint")}>
            {habit.name}
          </span>
        </Link>

        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <HabitScheduleBadge
              frequency={habit.frequency}
              weekdays={habit.weekdays}
              weeklyTarget={habit.weeklyTarget}
            />
            <HabitWeeklyBadge weekly={habit.weekly} />
          </div>
        )}
      </div>

      <HabitStreakBadge
        streaks={habit.streaks}
        unit={habit.frequency === "WEEKLY" ? "week" : "day"}
        className="shrink-0"
      />
    </li>
  );
}

/** A list of day rows, used by both Today and the dashboard panel. */
export function HabitDayList({
  habits,
  today,
  compact = false,
}: {
  habits: readonly HabitDayView[];
  today: string;
  compact?: boolean;
}) {
  return (
    <ul className={cn("space-y-0.5", compact && "space-y-0")}>
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} today={today} compact={compact} />
      ))}
    </ul>
  );
}
