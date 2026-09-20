import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getProjectDetail, type ProjectTaskFilter } from "@/lib/projects/queries";
import { MilestoneList } from "@/components/projects/MilestoneList";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectStats } from "@/components/projects/ProjectStats";
import { ProjectTaskSection } from "@/components/projects/ProjectTaskSection";

/**
 * Mission control for one project.
 *
 * A single query assembles the project, its milestones, their task counts and
 * the task list — the panels share almost all of their data, and six
 * sequential fetches is what makes a page like this feel slow.
 *
 * A project that is not the caller's resolves to `null` and becomes a 404,
 * indistinguishable from one that never existed.
 */

const TASK_FILTERS: readonly ProjectTaskFilter[] = ["all", "open", "completed", "overdue"];

function parseTaskFilter(value: string | undefined): ProjectTaskFilter {
  return TASK_FILTERS.includes(value as ProjectTaskFilter) ? (value as ProjectTaskFilter) : "all";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { projectId } = await params;
  const detail = await getProjectDetail(user.id, projectId, user.timezone);

  return { title: detail?.project.name ?? "Project" };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [{ projectId }, query] = await Promise.all([params, searchParams]);

  const rawFilter = query.tasks;
  const filter = parseTaskFilter(Array.isArray(rawFilter) ? rawFilter[0] : rawFilter);

  const detail = await getProjectDetail(user.id, projectId, user.timezone, filter);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <ProjectHeader project={detail.project} today={detail.today} />

      <ProjectStats detail={detail} />

      <MilestoneList
        projectId={detail.project.id}
        milestones={detail.milestones}
        tasks={detail.tasks}
        today={detail.today}
      />

      <ProjectTaskSection
        projectId={detail.project.id}
        tasks={detail.unassignedTasks}
        filter={filter}
        hasMilestones={detail.milestones.length > 0}
        today={detail.today}
      />
    </div>
  );
}
