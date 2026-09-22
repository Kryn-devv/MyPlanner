import { CalendarRange, Flame, Repeat } from "lucide-react";
import { HABIT_FREQUENCY_CONFIG, HABIT_STATUS_CONFIG, WEEKDAY_OPTIONS } from "@/config/habits";
import { cn } from "@/lib/cn";
import type { HabitStreaks } from "@/lib/habits/logic";
import type { HabitFrequency, HabitStatus } from "@/generated/prisma/enums";

/**
 * Habit chips.
 *
 * Every one carries a glyph or an icon and a word as well as a colour, so a
 * habit's state never depends on colour perception — the rule the goal,
 * project and priority badges already follow.
 */
const CHIP =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium";

export function HabitStatusBadge({
  status,
  className,
}: {
  status: HabitStatus;
  className?: string;
}) {
  // Active is the unremarkable case: labelling it would put a chip on every
  // row that says only "this is a habit".
  if (status === "ACTIVE") return null;
  const config = HABIT_STATUS_CONFIG[status];

  return (
    <span className={cn(CHIP, config.badgeClass, className)}>
      <span aria-hidden="true" className="text-[0.625rem] leading-none">
        {config.glyph}
      </span>
      <span className="sr-only">Status: </span>
      {config.label}
    </span>
  );
}

/** Says the schedule in words: "Every day", "Mon, Wed, Fri", "3× a week". */
export function describeSchedule(
  frequency: HabitFrequency,
  weekdays: readonly number[],
  weeklyTarget: number | null,
): string {
  switch (frequency) {
    case "DAILY":
      return "Every day";
    case "WEEKDAYS": {
      if (weekdays.length === 0) return "No days chosen";
      if (weekdays.length === 7) return "Every day";
      // Ordered Monday-first, as the pickers and the grid are.
      const names = WEEKDAY_OPTIONS.filter((option) => weekdays.includes(option.value)).map(
        (option) => option.short,
      );
      return names.join(", ");
    }
    case "WEEKLY":
      return `${weeklyTarget ?? 1}× a week`;
  }
}

export function HabitScheduleBadge({
  frequency,
  weekdays,
  weeklyTarget,
  className,
}: {
  frequency: HabitFrequency;
  weekdays: readonly number[];
  weeklyTarget: number | null;
  className?: string;
}) {
  const Icon = frequency === "WEEKLY" ? CalendarRange : Repeat;

  return (
    <span className={cn(CHIP, "border-line bg-white/[0.02] text-ink-muted", className)}>
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      <span className="sr-only">Schedule: </span>
      {describeSchedule(frequency, weekdays, weeklyTarget)}
    </span>
  );
}

/**
 * The streak chip.
 *
 * A streak of zero is not shown: "0 day streak" is a scolding, and the point
 * of the number is encouragement. `currentClipped` means the run reached the
 * edge of the history window, so the figure is a floor rather than a total.
 */
export function HabitStreakBadge({
  streaks,
  unit = "day",
  className,
}: {
  streaks: HabitStreaks;
  unit?: "day" | "week";
  className?: string;
}) {
  if (streaks.current <= 0) return null;

  const noun = streaks.current === 1 ? unit : `${unit}s`;

  return (
    <span
      className={cn(CHIP, "border-caution/25 bg-caution/10 text-caution", className)}
      title={streaks.currentClipped ? "At least this long — older history is not loaded." : undefined}
    >
      <Flame className="h-2.5 w-2.5" aria-hidden="true" />
      <span className="tnum">
        {streaks.current}
        {streaks.currentClipped && "+"}
      </span>{" "}
      <span>{noun}</span>
    </span>
  );
}

/** This week's count against the target, for a times-per-week habit. */
export function HabitWeeklyBadge({
  weekly,
  className,
}: {
  weekly: { readonly done: number; readonly target: number } | null;
  className?: string;
}) {
  if (!weekly) return null;
  const met = weekly.done >= weekly.target;

  return (
    <span
      className={cn(
        CHIP,
        met ? "border-positive/25 bg-positive/10 text-positive" : "border-line bg-white/[0.02] text-ink-muted",
        className,
      )}
    >
      <span className="tnum">
        {weekly.done}/{weekly.target}
      </span>{" "}
      <span>this week</span>
    </span>
  );
}
