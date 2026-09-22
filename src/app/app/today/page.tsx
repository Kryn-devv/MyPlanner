import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Sparkles } from "lucide-react";
import { MAX_DAY_OFFSET, TODAY_DATE_PARAM } from "@/config/today";
import { requireUser } from "@/lib/auth/guard";
import {
  daysBetween,
  formatLongDate,
  formatRelativeDay,
  getGreeting,
  getLocalToday,
  isLocalDate,
  type LocalDate,
} from "@/lib/datetime";
import { deriveDayFocus } from "@/lib/today/logic";
import { getHabitsForDay } from "@/lib/habits/queries";
import { getTodayData } from "@/lib/today/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuickAddPrompt } from "@/components/dashboard/QuickAddPrompt";
import { EmptyState } from "@/components/ui/States";
import { TaskList } from "@/components/tasks/TaskList";
import { DaySummary } from "@/components/today/DaySummary";
import { TodayDateNav } from "@/components/today/TodayDateNav";
import { TodaySection } from "@/components/today/TodaySection";
import { HabitDayList } from "@/components/habits/HabitRow";

export const metadata: Metadata = { title: "Today" };

/**
 * The daily command centre.
 *
 * Today owns no data. A day is a query over the `dueDate` column that already
 * exists on every task: there is no daily plan, no schedule row, no copy of a
 * task. That is why the page needs no migration and cannot fall out of step
 * with the task list — they are reading the same column.
 *
 * It is also why the page is read-mostly. Completion, XP, streaks and editing
 * all run through the components and actions that already own them; this page
 * arranges them around a day and adds nothing of its own to the write path.
 *
 * Two dates drive everything, and keeping them apart is the whole semantic
 * model:
 *
 *  - **today** — the user's real current date, resolved in their timezone.
 *    Overdue is measured against this and nothing else, so browsing to next
 *    week can never claim a future task is late.
 *  - **selectedDate** — the day on screen, from `?date=`. Defaults to today.
 *
 * Calendar answers "when?". This page answers "what now?".
 */
function parseDate(value: string | undefined, today: LocalDate): LocalDate {
  // `isLocalDate` round-trips the value, so "2026-02-31" is rejected rather
  // than silently rolling forward into March.
  if (!isLocalDate(value)) return today;
  // Bounded: the date arrives from a URL, and "any day in history" is an
  // unbounded surface for no benefit.
  if (Math.abs(daysBetween(value, today)) > MAX_DAY_OFFSET) return today;
  return value;
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const raw = params[TODAY_DATE_PARAM];
  const requested = Array.isArray(raw) ? raw[0] : raw;

  const today = getLocalToday(user.timezone);
  const selectedDate = parseDate(requested, today);

  // Habits are a separate read, not part of `getTodayData`: they are not
  // tasks and share none of its query surface. Running the two concurrently
  // keeps the page one round trip deep.
  const [data, habits] = await Promise.all([
    getTodayData(user.id, user.timezone, selectedDate, today),
    getHabitsForDay(user.id, selectedDate, today),
  ]);
  const { sections, progress, workload, overdue, alsoCompleted, upcoming, unscheduled } = data;

  const habitsKept = habits.filter((habit) => habit.completed).length;
  const focus = deriveDayFocus([...sections.timed, ...sections.allDay, ...sections.completed]);
  const isToday = data.relation === "today";
  const hasDayTasks = progress.total > 0;

  return (
    // Capped at a readable measure: a day is a list of short rows, and running
    // them the full width of a desktop display makes them harder to scan, not
    // easier.
    <div className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow={isToday ? getGreeting(user.timezone) : formatRelativeDay(selectedDate, today)}
        title={isToday ? "Today" : formatRelativeDay(selectedDate, today)}
        description={<span>{formatLongDate(selectedDate)}</span>}
        actions={<QuickAddPrompt label="New task" dueDate={selectedDate} />}
      />

      <TodayDateNav selectedDate={selectedDate} today={today} />

      <DaySummary
        progress={progress}
        workload={workload}
        xpEarned={data.xpEarned}
        streak={data.streak}
        focus={focus}
        relation={data.relation}
        overdueCount={overdue.total}
        trackedFocusSeconds={data.trackedFocusSeconds}
      />

      {overdue.total > 0 && (
        <TodaySection
          id="overdue"
          title="Overdue"
          count={overdue.total}
          tone="critical"
          note={
            isToday
              ? "Outstanding work whose deadline has already passed."
              : "Outstanding as of today — not as of the day you are viewing."
          }
        >
          {/* The same list component as everywhere else, so completing one
              here runs exactly the completion, XP and streak logic that the
              task page does. The original due date is shown: it is the whole
              point of the section. */}
          <TaskList tasks={overdue.tasks} showFocus trackedByTask={data.trackedByTask} />
          {overdue.truncated && (
            <p className="text-[0.8125rem] text-ink-faint">
              Showing {overdue.tasks.length} of {overdue.total}.{" "}
              <Link
                href={{ pathname: "/app/tasks", query: { status: "open" } }}
                className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                See every open task
              </Link>
              .
            </p>
          )}
        </TodaySection>
      )}

      {habits.length > 0 && (
        <TodaySection
          id="habits"
          title="Habits"
          count={habits.length}
          note={
            habitsKept === habits.length
              ? "Every habit due on this day is done."
              : `${habitsKept} of ${habits.length} kept.`
          }
        >
          {/* A habit is not a task and is deliberately not rendered as one:
              no priority, no due time, no project — just the tick, the name
              and the run it is part of. */}
          <HabitDayList habits={habits} today={today} />
        </TodaySection>
      )}

      {sections.timed.length > 0 && (
        <TodaySection id="timed" title="At a time" count={sections.timed.length}>
          <TaskList
            tasks={sections.timed}
            groupedByDate={selectedDate}
            showFocus
            trackedByTask={data.trackedByTask}
          />
        </TodaySection>
      )}

      {sections.allDay.length > 0 && (
        <TodaySection id="allday" title="All day" count={sections.allDay.length}>
          <TaskList
            tasks={sections.allDay}
            groupedByDate={selectedDate}
            showFocus
            trackedByTask={data.trackedByTask}
          />
        </TodaySection>
      )}

      {!hasDayTasks && habits.length === 0 && (
        <EmptyState
          icon={<CalendarCheck />}
          // Not lower-cased: the label can be a date like "Thu 24 Sep", and
          // flattening its case to fit a sentence mangles it.
          title={
            isToday
              ? "Nothing scheduled for today"
              : `Nothing scheduled — ${formatRelativeDay(selectedDate, today)}`
          }
          description={
            overdue.total > 0
              ? "The day itself is clear — the outstanding work above is from earlier days."
              : "Give a task a due date and it will show up here on the day."
          }
          action={<QuickAddPrompt label="Add a task" dueDate={selectedDate} />}
        />
      )}

      {data.dayTruncated && (
        // The figures above are aggregates over the whole day, so they stay
        // right even here; only the list is bounded, and saying so is the
        // difference between a cap and a quiet omission.
        <p className="text-[0.8125rem] text-ink-faint">
          Showing the first {sections.timed.length + sections.allDay.length + sections.completed.length}{" "}
          of {progress.total} tasks for this day. The totals above cover all of them.{" "}
          <Link
            href={{ pathname: "/app/tasks", query: { status: "all" } }}
            className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            See every task
          </Link>
          .
        </p>
      )}

      {progress.isComplete && hasDayTasks && (
        <p className="flex items-center gap-2 text-[0.875rem] text-positive">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Everything scheduled for this day is done.
        </p>
      )}

      {sections.completed.length > 0 && (
        <TodaySection
          id="completed"
          title={isToday ? "Completed today" : "Completed"}
          count={sections.completed.length}
        >
          <TaskList
            tasks={sections.completed}
            groupedByDate={selectedDate}
            trackedByTask={data.trackedByTask}
          />
        </TodaySection>
      )}

      {alsoCompleted.tasks.length > 0 && (
        <TodaySection
          id="also-completed"
          title="Also finished this day"
          count={alsoCompleted.total}
          note="Finished on this day but not scheduled for it — so it does not count towards this day's total."
        >
          <TaskList tasks={alsoCompleted.tasks} trackedByTask={data.trackedByTask} />
        </TodaySection>
      )}

      {upcoming.tasks.length > 0 && (
        <TodaySection
          id="upcoming"
          title="Up next"
          count={upcoming.total}
          action={
            <Link
              href={{ pathname: "/app/calendar", query: { view: "timeline", date: selectedDate } }}
              className="text-[0.8125rem] text-ink-muted transition-colors hover:text-ink"
            >
              See the timeline
            </Link>
          }
        >
          {/* A preview, not a second calendar: a handful of rows, and a link
              to the surface that is actually built for looking ahead. */}
          <TaskList tasks={upcoming.tasks} readOnly />
        </TodaySection>
      )}

      {unscheduled.tasks.length > 0 && (
        <TodaySection
          id="unscheduled"
          title="Unscheduled"
          count={unscheduled.total}
          note="No due date, so these belong to no day and are never counted as overdue."
          action={
            <Link
              href="/app/tasks"
              className="text-[0.8125rem] text-ink-muted transition-colors hover:text-ink"
            >
              All tasks
            </Link>
          }
        >
          <TaskList tasks={unscheduled.tasks} readOnly />
        </TodaySection>
      )}

      {/* A quiet way out of an empty day, rather than a dead end. */}
      {!hasDayTasks && overdue.total === 0 && upcoming.total === 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Nothing ahead in the next week either.
          </span>
          <Link href="/app/projects" className="text-ink-muted transition-colors hover:text-ink">
            Open a project
          </Link>
          <Link href="/app/calendar" className="text-ink-muted transition-colors hover:text-ink">
            Open the calendar
          </Link>
        </p>
      )}
    </div>
  );
}
