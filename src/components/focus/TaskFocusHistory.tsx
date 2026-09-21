import { formatRelativeDay, formatDuration, toLocalDate, type LocalDate } from "@/lib/datetime";
import { formatTrackedTime } from "@/lib/focus/duration";
import type { TaskFocusHistory as History } from "@/lib/focus/queries";

/**
 * A task's focus record.
 *
 * Two measurements side by side and no judgement between them. "Estimated" is
 * what was planned, "tracked focus" is what was recorded through a session —
 * not a claim about how productive the time was, and not a score. The
 * difference is stated because it is useful, not because either number is
 * a target the other failed to meet.
 */
export function TaskFocusHistory({
  history,
  estimatedMinutes,
  timezone,
  today,
}: {
  history: History;
  estimatedMinutes: number | null;
  timezone: string;
  today: LocalDate;
}) {
  if (history.sessionCount === 0 && estimatedMinutes === null) return null;

  const trackedMinutes = Math.round(history.totalSeconds / 60);
  const difference =
    estimatedMinutes !== null && history.sessionCount > 0
      ? trackedMinutes - estimatedMinutes
      : null;

  return (
    <section aria-labelledby="task-focus-heading" className="space-y-2">
      <h3 id="task-focus-heading" className="eyebrow">
        Focus
      </h3>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]">
        {estimatedMinutes !== null && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-faint">Estimated</dt>
            <dd className="tnum text-ink">{formatDuration(estimatedMinutes)}</dd>
          </div>
        )}

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink-faint">Tracked focus</dt>
          <dd className="tnum text-ink">{formatTrackedTime(history.totalSeconds)}</dd>
        </div>

        {difference !== null && difference !== 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Difference against the estimate</dt>
            <dd className="tnum text-ink-faint">
              {difference > 0 ? "+" : "−"}
              {formatDuration(Math.abs(difference))}
            </dd>
          </div>
        )}

        {history.sessionCount > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Sessions</dt>
            <dd className="tnum text-ink-faint">
              {history.sessionCount} session{history.sessionCount === 1 ? "" : "s"}
            </dd>
          </div>
        )}
      </dl>

      {history.recent.length > 0 && (
        <ul className="space-y-0.5 text-[0.75rem] text-ink-faint">
          {history.recent.map((entry) => (
            <li key={entry.id} className="tnum">
              {formatTrackedTime(entry.seconds)} ·{" "}
              {formatRelativeDay(toLocalDate(new Date(entry.endedAt), timezone), today)}
            </li>
          ))}
          {history.truncated && <li>…and earlier sessions.</li>}
        </ul>
      )}
    </section>
  );
}
