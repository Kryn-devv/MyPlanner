import type { Metadata } from "next";
import { ListTodo } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { PRIORITIES } from "@/config/priorities";
import { NO_PROJECT } from "@/config/projects";
import { getProjectOptions } from "@/lib/projects/queries";
import { getCategories, getTasks, type TaskStatusFilter } from "@/lib/tasks/queries";
import { getLocalToday } from "@/lib/datetime";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuickAddPrompt } from "@/components/dashboard/QuickAddPrompt";

import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskList } from "@/components/tasks/TaskList";

export const metadata: Metadata = { title: "Tasks" };

/**
 * Filters arrive as URL search params. They are parsed and narrowed here
 * before reaching the query layer — an unrecognised value falls back to the
 * default rather than being passed through to the database.
 */
function parseStatus(value: string | undefined): TaskStatusFilter {
  return value === "completed" || value === "all" ? value : "open";
}

function parsePriority(value: string | undefined): (typeof PRIORITIES)[number] | null {
  return value && (PRIORITIES as readonly string[]).includes(value)
    ? (value as (typeof PRIORITIES)[number])
    : null;
}

export default async function TasksPage({
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
  const priority = parsePriority(single("priority"));
  const search = single("q")?.trim() || null;
  const requestedCategory = single("category") ?? null;

  const [categories, projects] = await Promise.all([
    getCategories(user.id),
    getProjectOptions(user.id),
  ]);
  // Silently drop a category id that is not the caller's — the filter simply
  // does not apply rather than returning an error or somebody else's tasks.
  const categoryId = requestedCategory && categories.some((c) => c.id === requestedCategory)
    ? requestedCategory
    : null;

  // Same treatment as the category filter: an id that is not the caller's is
  // silently dropped rather than queried, so the filter simply does not apply.
  const requestedProject = single("project") ?? null;
  const projectId =
    requestedProject === NO_PROJECT
      ? NO_PROJECT
      : requestedProject && projects.some((p) => p.id === requestedProject)
        ? requestedProject
        : null;

  const requestedMilestone = single("milestone") ?? null;
  const milestoneId =
    projectId && projectId !== NO_PROJECT && requestedMilestone
      ? (projects
          .find((p) => p.id === projectId)
          ?.milestones.some((m) => m.id === requestedMilestone)
          ? requestedMilestone
          : null)
      : null;

  const tasks = await getTasks(user.id, {
    status,
    categoryId,
    priority,
    search,
    projectId,
    milestoneId,
  });
  const today = getLocalToday(user.timezone);

  const openCount = tasks.filter((task) => !task.completed).length;
  const doneCount = tasks.length - openCount;

  return (
    // The header and filters span the page, but list rows are capped at a
    // readable measure — full-width rows of short text look empty on a wide
    // display.
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Tasks"
        description={
          tasks.length > 0 ? (
            <span className="tnum">
              {openCount} open · {doneCount} completed
            </span>
          ) : undefined
        }
      />

      <TaskFilters
        categories={categories}
        projects={projects}
        status={status}
        categoryId={categoryId}
        priority={priority}
        search={search}
        projectId={projectId}
        milestoneId={milestoneId}
      />

      <TaskList
        tasks={tasks}
        emptyIcon={<ListTodo />}
        emptyTitle={
          search || categoryId || priority || projectId || status !== "open"
            ? "No tasks match these filters"
            : "No open tasks"
        }
        emptyDescription={
          search || categoryId || priority || projectId || status !== "open"
            ? "Try widening or clearing the filters."
            : "Everything is done. Add a task to keep the streak going."
        }
        emptyAction={<QuickAddPrompt label="Add a task" />}
      />
    </div>
  );
}
