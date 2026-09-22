import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, Flame, Percent, Repeat } from "lucide-react";
import { HISTORY_GRID_WEEKS } from "@/config/habits";
import { requireUser } from "@/lib/auth/guard";
import { formatLongDate, formatRelativeDay, getLocalToday } from "@/lib/datetime";
import { getHabitDetail } from "@/lib/habits/queries";
import { HabitHeader } from "@/components/habits/HabitHeader";
import { HabitHistoryGrid } from "@/components/habits/HabitHistoryGrid";
import { EmptyState } from "@/components/ui/States";

/**
 * A single habit: how it is going, and what actually happened.
 *
 * The page is a read over completion rows. Streaks, rates and the grid are all
 * derived from the same bounded set of dates, so nothing on it can disagree
 * with anything else — and editing the habit changes what is due from here on
 * without rewriting a single day of what is shown below.
 *
 * A habit that is not the caller's resolves to `null` and becomes a 404,
 * indistinguishable from one that never existed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ habitId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { habitId } = await params;
  const detail = await getHabitDetail(user.id, habitId, user.timezone);

  return { title: detail?.name ?? "Habit" };
}

export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ habitId: string }>;
}) {
  const user = await requireUser();
  const { habitId } = await params;

  const habit = await getHabitDetail(user.id, habitId, user.timezone);
  if (!habit) notFound();

  const today = getLocalToday(user.timezone);
  const unit = habit.frequency === "WEEKLY" ? "week" : "day";

  const figures = [
    {
      icon: Flame,
      label: "Current streak",
      value: `${habit.streaks.current}${habit.streaks.currentClipped ? "+" : ""}`,
      detail: habit.streaks.current === 1 ? unit : `${unit}s`,
    },
    {
      icon: Repeat,
      label: "Longest streak",
      // Clipped means the best run reached the edge of the loaded history, so
      // the true figure is at least this — the same caveat the current streak
      // carries, and leaving it off here would make a shrinking number look
      // like a fact.
      value: `${habit.streaks.longest}${habit.streaks.longestClipped ? "+" : ""}`,
      detail: habit.streaks.longest === 1 ? unit : `${unit}s`,
    },
    {
      icon: Percent,
      label: "Last 30 days",
      value: habit.rate30.scheduled === 0 ? "—" : `${habit.rate30.percent}%`,
      detail:
        habit.rate30.scheduled === 0
          ? "nothing due yet"
          : `${habit.rate30.completed} of ${habit.rate30.scheduled} kept`,
    },
    {
      icon: CalendarCheck,
      label: "All time",
      value: String(habit.completionCount),
      detail: habit.completionCount === 1 ? "day kept" : "days kept",
    },
  ];

  return (
    <div className="space-y-6">
      <HabitHeader habit={habit} today={today} />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((figure) => (
          <li key={figure.label} className="panel px-4 py-3">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-faint">
              <figure.icon className="h-3 w-3" aria-hidden="true" />
              {figure.label}
            </p>
            <p className="tnum mt-1 text-xl font-semibold text-ink">{figure.value}</p>
            <p className="text-[0.75rem] text-ink-muted">{figure.detail}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="history-heading" className="panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-heading" className="eyebrow">
            Last {HISTORY_GRID_WEEKS} weeks
          </h2>
          <p className="text-[0.75rem] text-ink-faint">
            Started {formatLongDate(habit.startDate)}
            {habit.endDate && ` · ends ${formatLongDate(habit.endDate)}`}
          </p>
        </div>

        <HabitHistoryGrid history={habit.history} />

        {/* Named for the window it actually covers. The "All time" figure
            above is a lifetime count from the database; this one is a rate
            over the twelve months of history that get loaded, and for a
            times-per-week habit its unit is the week. */}
        <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
          Last 12 months: {habit.rateYear.completed} of {habit.rateYear.scheduled}{" "}
          {habit.frequency === "WEEKLY" ? "weeks" : "occurrences"} kept
          {habit.rateYear.scheduled > 0 && ` (${habit.rateYear.percent}%)`}. Days the habit was not
          due, was paused, or had not started yet are not counted as missed.
        </p>
      </section>

      <section aria-labelledby="recent-heading" className="panel p-4">
        <h2 id="recent-heading" className="eyebrow mb-3">
          Recent completions
        </h2>

        {habit.recent.length === 0 ? (
          <EmptyState
            dense
            icon={<CalendarCheck />}
            title="Nothing recorded yet."
            description="Tick it off once and the history starts here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {habit.recent.map((entry) => (
              <li
                key={entry.date}
                className="flex items-baseline justify-between gap-3 py-2 text-[0.8125rem]"
              >
                <span className="text-ink">{formatLongDate(entry.date)}</span>
                <span className="tnum shrink-0 text-ink-faint">
                  {formatRelativeDay(entry.date, today)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
