import type { Metadata } from "next";
import { HABIT_FILTERS, type HabitStatusFilter } from "@/config/habits";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday } from "@/lib/datetime";
import { getHabitStatusCounts, getHabits, getHabitsForDay } from "@/lib/habits/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { HabitFilterBar } from "@/components/habits/HabitFilterBar";
import { HabitList } from "@/components/habits/HabitList";
import { NewHabitButton } from "@/components/habits/NewHabitButton";

export const metadata: Metadata = { title: "Habits" };

/**
 * The habit list.
 *
 * A server component: filtering and searching happen in the query layer, and
 * every streak and rate on the page is derived there from completion dates
 * rather than read from a stored counter. Nothing on this page is a number
 * somebody has to remember to keep up to date.
 *
 * Unrecognised search params fall back to the default rather than reaching the
 * database.
 */
function parseStatus(value: string | undefined): HabitStatusFilter {
  const known = HABIT_FILTERS.map((filter) => filter.value);
  return known.includes(value as HabitStatusFilter) ? (value as HabitStatusFilter) : "ACTIVE";
}

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const single = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = parseStatus(single("status"));
  const search = single("q")?.trim() || null;
  const today = getLocalToday(user.timezone);

  const [habits, counts, todayHabits] = await Promise.all([
    getHabits(user.id, user.timezone, { status, search }),
    getHabitStatusCounts(user.id),
    // Deliberately unfiltered: the header states how the day is going, and a
    // figure derived from the filtered list would say "nothing due today"
    // while five active habits were in fact waiting behind the Paused tab.
    getHabitsForDay(user.id, today, today),
  ]);

  const dueToday = todayHabits.filter((habit) => habit.status === "ACTIVE" && habit.due);
  const keptToday = dueToday.filter((habit) => habit.satisfied).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What you want to become"
        title="Habits"
        description={
          counts.ALL > 0 ? (
            <span className="tnum">
              {dueToday.length > 0
                ? `${keptToday} of ${dueToday.length} kept today`
                : "Nothing due today"}{" "}
              · {counts.ACTIVE} active · {counts.PAUSED} paused · {counts.ARCHIVED} archived
            </span>
          ) : undefined
        }
        actions={<NewHabitButton withShortcut />}
      />

      <HabitFilterBar status={status} search={search} counts={counts} />

      <HabitList
        habits={habits}
        today={today}
        isFiltered={status !== "ACTIVE" || Boolean(search)}
      />
    </div>
  );
}
