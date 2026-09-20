import type { Metadata } from "next";
import { PROJECT_FILTERS, PROJECT_SORTS, type ProjectSort, type ProjectStatusFilter } from "@/config/projects";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday } from "@/lib/datetime";
import { NO_GOAL } from "@/config/goals";
import { getGoalOptions } from "@/lib/goals/queries";
import { getProjects, getProjectStatusCounts } from "@/lib/projects/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import { ProjectFilterBar } from "@/components/projects/ProjectFilterBar";
import { ProjectList } from "@/components/projects/ProjectList";

export const metadata: Metadata = { title: "Projects" };

/**
 * The project list.
 *
 * A server component: filtering, searching and sorting all happen in the
 * query layer, so the browser receives only the projects it is going to show.
 * Unrecognised search params fall back to the default rather than reaching the
 * database.
 */
function parseStatus(value: string | undefined): ProjectStatusFilter {
  const known = PROJECT_FILTERS.map((f) => f.value);
  return known.includes(value as ProjectStatusFilter) ? (value as ProjectStatusFilter) : "ACTIVE";
}

function parseSort(value: string | undefined): ProjectSort {
  const known = PROJECT_SORTS.map((s) => s.value);
  return known.includes(value as ProjectSort) ? (value as ProjectSort) : "urgency";
}

export default async function ProjectsPage({
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

  const goals = await getGoalOptions(user.id);

  // Same treatment as every other id filter: one that is not the caller's is
  // silently dropped rather than queried, so the filter simply does not apply.
  const requestedGoal = single("goal") ?? null;
  const goalId =
    requestedGoal === NO_GOAL
      ? NO_GOAL
      : requestedGoal && goals.some((g) => g.id === requestedGoal)
        ? requestedGoal
        : null;

  const [projects, counts] = await Promise.all([
    getProjects(user.id, user.timezone, { status, search, sort, goalId }),
    getProjectStatusCounts(user.id),
  ]);

  const today = getLocalToday(user.timezone);
  const isFiltered = status !== "ACTIVE" || Boolean(search) || goalId !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={
          counts.ALL > 0 ? (
            <span className="tnum">
              {counts.ACTIVE} active · {counts.COMPLETED} completed · {counts.ARCHIVED} archived
            </span>
          ) : undefined
        }
        actions={<NewProjectButton withShortcut />}
      />

      <ProjectFilterBar
        status={status}
        sort={sort}
        search={search}
        goalId={goalId}
        goals={goals}
        counts={counts}
      />

      <ProjectList projects={projects} today={today} isFiltered={isFiltered} />
    </div>
  );
}
