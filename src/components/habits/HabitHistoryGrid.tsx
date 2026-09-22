import { WEEKDAY_OPTIONS } from "@/config/habits";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/datetime";
import type { DayState } from "@/lib/habits/logic";
import type { HabitHistoryWeek } from "@/lib/habits/queries";

/**
 * Twelve weeks of history, a column per week.
 *
 * Every state is distinguished by shape as well as by colour — a solid fill, a
 * heavy ring, a dashed or dotted edge, a flat tile — because hue alone fails
 * anyone who cannot separate green from red, and because the cells are 14px
 * wide, where hue is the first thing to go. The legend names all six states in
 * words, and the grid carries a spoken summary with the counts, since a screen
 * reader cannot see any of it.
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

/**
 * Shape carries the meaning; colour only reinforces it.
 *
 *   kept            solid fill
 *   missed          heavy open ring
 *   due             dashed edge (nothing has gone wrong yet)
 *   paused          dotted edge
 *   not due         flat tile, no edge
 *   before it began nothing at all
 */
const STATE_CLASS: Record<DayState, string> = {
  completed: "border border-positive/70 bg-positive/70",
  due: "border border-dashed border-accent/60 bg-accent/10",
  missed: "border-2 border-critical/60 bg-transparent",
  "not-scheduled": "border border-transparent bg-white/[0.05]",
  paused: "border border-dotted border-caution/50 bg-caution/10",
  "before-start": "border border-transparent bg-transparent",
};

/** Every state, in the order a person reads the grid. */
const LEGEND: readonly DayState[] = [
  "completed",
  "missed",
  "due",
  "not-scheduled",
  "paused",
  "before-start",
];

export function HabitHistoryGrid({
  history,
  className,
}: {
  history: readonly HabitHistoryWeek[];
  className?: string;
}) {
  const counts = history.reduce<Record<DayState, number>>(
    (totals, week) => {
      for (const day of week.days) totals[day.state] += 1;
      return totals;
    },
    { completed: 0, due: 0, missed: 0, "not-scheduled": 0, paused: 0, "before-start": 0 },
  );

  // Spoken as a sentence, because the cells themselves are presentational:
  // `role="img"` makes descendants unreachable, and a `title` on a span is
  // mouse-only anyway. The counts are what the picture actually says.
  const summary = [
    `Last ${history.length} weeks`,
    `${counts.completed} kept`,
    `${counts.missed} missed`,
    `${counts.due} still due`,
    `${counts["not-scheduled"]} not due`,
    counts.paused > 0 ? `${counts.paused} paused` : null,
  ]
    .filter(Boolean)
    .join(", ");

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

        <div role="img" aria-label={`${summary}.`} className="flex gap-1">
          {history.map((week) => (
            <div key={week.start} className="grid grid-rows-7 gap-1">
              {week.days.map((day) => (
                <span
                  key={day.date}
                  title={`${formatLongDate(day.date)} — ${STATE_LABEL[day.state]}`}
                  className={cn("h-3.5 w-3.5 rounded-[3px]", STATE_CLASS[day.state])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-ink-faint">
        {LEGEND.map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", STATE_CLASS[state])}
            />
            {STATE_LABEL[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}
