import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday } from "@/lib/datetime";
import { getXpForNextLevel } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import { getActiveFocusSession } from "@/lib/focus/queries";
import { getGoalOptions } from "@/lib/goals/queries";
import { getProjectOptions } from "@/lib/projects/queries";
import { getCategories } from "@/lib/tasks/queries";
import { getDisplayStreak } from "@/lib/streak";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { GoalDialogProvider } from "@/components/goals/GoalDialogProvider";
import { ProjectDialogProvider } from "@/components/projects/ProjectDialogProvider";
import { TaskDialogProvider } from "@/components/tasks/TaskDialogProvider";
import { FocusBar } from "@/components/focus/FocusBar";
import { FocusConflictDialog } from "@/components/focus/FocusConflictDialog";
import { FocusProvider } from "@/components/focus/FocusProvider";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * The protected shell.
 *
 * Authorisation happens here and again inside every query and mutation — this
 * layout is a convenience for redirecting, not the security boundary. The
 * boundary is that no data access path exists that is not scoped by `userId`.
 *
 * Categories, projects and today's date are resolved once here and handed to
 * the dialog provider, so the task form does not have to fetch them each time
 * it opens.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const [stats, categories, projects, goals, activeFocus] = await Promise.all([
    prisma.userStats.findUnique({
      where: { userId: user.id },
      select: { totalXp: true, currentStreak: true, longestStreak: true, lastCompletedDate: true },
    }),
    getCategories(user.id),
    // Resolved once here so the task dialog can offer project and milestone
    // pickers without fetching every time it opens.
    getProjectOptions(user.id),
    // Resolved once here so the project form can offer a goal picker without
    // fetching every time it opens.
    getGoalOptions(user.id),
    // One indexed row. The shell needs to know whether anything is running so
    // the focus bar can appear on any page; it deliberately fetches nothing
    // else about focus.
    getActiveFocusSession(user.id),
  ]);

  const today = getLocalToday(user.timezone);
  const progress = getXpForNextLevel(stats?.totalXp ?? 0);
  const streak = getDisplayStreak(
    {
      currentStreak: stats?.currentStreak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
      lastCompletedDate: stats?.lastCompletedDate ?? null,
    },
    today,
  );

  return (
    <ToastProvider>
      {/* Nested outermost-first so the Quick Add button in the header, which
          can create any of the three, sits inside all of them. */}
      <FocusProvider active={activeFocus}>
        <GoalDialogProvider connectableProjects={projects}>
          <ProjectDialogProvider goals={goals}>
            <TaskDialogProvider
              categories={categories}
              projects={projects}
              today={today}
            >
              <div className="relative z-10 flex min-h-dvh">
                <Sidebar
                  progress={progress}
                  className="sticky top-0 hidden lg:flex"
                />

                <div className="flex min-w-0 flex-1 flex-col">
                  <Topbar
                    name={user.name}
                    level={progress.level}
                    totalXp={progress.totalXp}
                    streak={streak}
                  />

                  {/* Sits under the header rather than floating: it is context,
                    not a modal, and on a phone it costs one line. */}
                  <FocusBar />

                  <main
                    id="main"
                    // Bottom padding clears the mobile navigation bar.
                    className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:pb-12"
                  >
                    {children}
                  </main>
                </div>
              </div>

              <MobileNav />
              <FocusConflictDialog />
            </TaskDialogProvider>
          </ProjectDialogProvider>
        </GoalDialogProvider>
      </FocusProvider>
    </ToastProvider>
  );
}
