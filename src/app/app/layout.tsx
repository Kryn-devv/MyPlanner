import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday } from "@/lib/datetime";
import { getXpForNextLevel } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/tasks/queries";
import { getDisplayStreak } from "@/lib/streak";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { TaskDialogProvider } from "@/components/tasks/TaskDialogProvider";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * The protected shell.
 *
 * Authorisation happens here and again inside every query and mutation — this
 * layout is a convenience for redirecting, not the security boundary. The
 * boundary is that no data access path exists that is not scoped by `userId`.
 *
 * Categories and today's date are resolved once here and handed to the dialog
 * provider, so the task form does not have to fetch them each time it opens.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const [stats, categories] = await Promise.all([
    prisma.userStats.findUnique({
      where: { userId: user.id },
      select: { totalXp: true, currentStreak: true, longestStreak: true, lastCompletedDate: true },
    }),
    getCategories(user.id),
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
      <TaskDialogProvider categories={categories} today={today}>
        <div className="relative z-10 flex min-h-dvh">
          <Sidebar progress={progress} className="sticky top-0 hidden lg:flex" />

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              name={user.name}
              level={progress.level}
              totalXp={progress.totalXp}
              streak={streak}
            />

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
      </TaskDialogProvider>
    </ToastProvider>
  );
}
