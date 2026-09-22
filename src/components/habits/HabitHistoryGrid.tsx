import { WEEKDAY_OPTIONS } from "@/config/habits";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/datetime";
import type { DayState } from "@/lib/habits/logic";
import type { HabitHistoryWeek } from "@/lib/habits/queries";

/**
 * Twelve weeks of history, a column per week.
 *
 * The six states are deliberately distinguished by more than colour: kept days
 * are filled, missed days carry a ring, and days that were never occurrences —
 * not scheduled, paused, before the habit began — are flat and unmarked. The
 * legend names all of them in words, and every cell's title says the date and
 * what happened on it, so the grid is readable without colour perception.
 *
 * A day that was not an occurrence is not a failure. That rule is the whole
 * reason this grid exists rather than a row of ticks and crosses.
 */
const STATE_LABEL: Record<DayState, string> = {
  completed: "Kept",
  due: "Due",
  missed: "Missed",
  "not-scheduled": "Not due",
  paused: "Paused",
  "before-start": "Before it began",
};

const STATE_CLASS: Record<DayState, string> = {
  completed: "bg-positive/70 border-positive/70",
  due: "bg-accent/15 border-accent/50",
  missed: "bg-transparent border-critical/50",
  "not-scheduled": "bg-white/[0.03] border-line",
  paused: "bg-caution/10 border-caution/30",
  "before-start": "bg-transparent border-line/50",
};

export function HabitHistoryGrid({
  history,
  className,
}: {
  history: readonly HabitHistoryWeek[];
  className?: string;
}) {
  const kept = history.reduce(
    (total, week) => total + week.days.filter((day) => day.state === "completed").length,
    0,
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* Weekday labels down the side, Monday first, matching the pickers. */}
        <ul aria-hidden="true" className="grid shrink-0 grid-rows-7 gap-1 pr-1">
          {WEEKDAY_OPTIONS.map((option, index) => (
            <li
              key={option.value}
              className="flex h-3.5 items-center text-[0.625rem] leading-none text-ink-faint"
            >
              {/* Every other label, so the column stays legible when small. */}
              {index % 2 === 0 ? option.short : ""}
            </li>
          ))}
        </ul>

        <div
          role="img"
          aria-label={`Last ${history.length} weeks: ${kept} ${kept === 1 ? "day" : "days"} kept.`}
          className="flex gap-1"
        >
          {history.map((week) => (
            <div key={week.start} className="grid grid-rows-7 gap-1">
              {week.days.map((day) => (
                <span
                  key={day.date}
                  title={`${formatLongDate(day.date)} — ${STATE_LABEL[day.state]}`}
                  className={cn("h-3.5 w-3.5 rounded-[3px] border", STATE_CLASS[day.state])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-ink-faint">
        {(["completed", "missed", "not-scheduled", "paused"] as const).map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-2.5 w-2.5 rounded-[3px] border", STATE_CLASS[state])}
            />
            {STATE_LABEL[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}
