import type { Metadata } from "next";
import { GOAL_FILTERS, GOAL_SORTS, type GoalSort, type GoalStatusFilter } from "@/config/goals";
import { requireUser } from "@/lib/auth/guard";
import { getGoals, getGoalStatusCounts } from "@/lib/goals/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoalFilterBar } from "@/components/goals/GoalFilterBar";
import { GoalList } from "@/components/goals/GoalList";
import { NewGoalButton } from "@/components/goals/NewGoalButton";

export const metadata: Metadata = { title: "Goals" };

/**
 * The goal list.
 *
 * A server component: filtering, searching and sorting all happen in the query
 * layer, so the browser receives only the goals it is going to show.
 * Unrecognised search params fall back to the default rather than reaching the
 * database.
 */
function parseStatus(value: string | undefined): GoalStatusFilter {
  const known = GOAL_FILTERS.map((f) => f.value);
  return known.includes(value as GoalStatusFilter) ? (value as GoalStatusFilter) : "ACTIVE";
}

function parseSort(value: string | undefined): GoalSort {
  const known = GOAL_SORTS.map((s) => s.value);
  return known.includes(value as GoalSort) ? (value as GoalSort) : "urgency";
}

export default async function GoalsPage({
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
  const sort = parseSort(single("sort"));
  const search = single("q")?.trim() || null;

  const [goals, counts] = await Promise.all([
    getGoals(user.id, user.timezone, { status, search, sort }),
    getGoalStatusCounts(user.id),
  ]);

  const isFiltered = status !== "ACTIVE" || Boolean(search);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What the work is for"
        title="Goals"
        description={
          counts.ALL > 0 ? (
            <span className="tnum">
              {counts.ACTIVE} active · {counts.COMPLETED} achieved · {counts.ARCHIVED} archived
            </span>
          ) : undefined
        }
        actions={<NewGoalButton withShortcut />}
      />

      <GoalFilterBar status={status} sort={sort} search={search} counts={counts} />

      <GoalList goals={goals} isFiltered={isFiltered} />
    </div>
  );
}
