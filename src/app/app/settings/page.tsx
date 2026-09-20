import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { signOutEverywhereAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday, formatLongDate } from "@/lib/datetime";
import { getXpForNextLevel } from "@/lib/leveling";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/tasks/queries";
import { formatXp } from "@/lib/xp";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryManager } from "@/components/settings/CategoryManager";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Settings" };

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1 text-[0.8125rem] text-ink-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();

  const [stats, categories] = await Promise.all([
    prisma.userStats.findUnique({
      where: { userId: user.id },
      select: { totalXp: true, longestStreak: true, tasksCompleted: true },
    }),
    getCategories(user.id),
  ]);

  const progress = getXpForNextLevel(stats?.totalXp ?? 0);
  const today = getLocalToday(user.timezone);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={`Your ${APP_NAME} account, timezone and categories.`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsSection
          title="Profile"
          description="Your timezone decides what counts as “today” for due dates and streaks."
        >
          <ProfileForm name={user.name} timezone={user.timezone} email={user.email} />
        </SettingsSection>

        <div className="space-y-5">
          <SettingsSection title="Progress" description="A summary of everything you have earned.">
            <dl className="grid grid-cols-2 gap-4">
              {[
                { label: "Level", value: progress.level },
                { label: "Total XP", value: formatXp(progress.totalXp) },
                { label: "Tasks completed", value: stats?.tasksCompleted ?? 0 },
                { label: "Longest streak", value: `${stats?.longestStreak ?? 0} days` },
              ].map((stat) => (
                <div key={stat.label} className="panel-flush px-3.5 py-3">
                  <dt className="eyebrow">{stat.label}</dt>
                  <dd className="tnum mt-1.5 text-lg font-semibold text-ink">{stat.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.75rem] text-ink-faint">
              Today is {formatLongDate(today)} in {user.timezone}.
            </p>
          </SettingsSection>

          <SettingsSection
            title="Security"
            description="Signing out everywhere ends every active session, including on other devices."
          >
            <form action={signOutEverywhereAction}>
              <Button type="submit" variant="danger" size="sm">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out everywhere
              </Button>
            </form>
          </SettingsSection>
        </div>

        <SettingsSection
          title="Categories"
          description="Group tasks however suits you. Archiving keeps existing tasks intact."
        >
          <CategoryManager categories={categories} />
        </SettingsSection>
      </div>
    </div>
  );
}
