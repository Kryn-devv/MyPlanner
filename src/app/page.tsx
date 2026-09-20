import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Flame, ListChecks, TrendingUp } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/app";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandMark } from "@/components/layout/Sidebar";
import { buttonClassName } from "@/components/ui/Button";

/**
 * Landing page.
 *
 * Signed-in visitors never see it — they go straight to the app, so the root
 * URL is a useful bookmark rather than a detour.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/app");

  const highlights = [
    { icon: ListChecks, title: "Tasks that carry weight", body: "Priorities, categories, deadlines and estimates — not just a checklist." },
    { icon: TrendingUp, title: "Progression that means something", body: "Every completed task writes to an auditable XP ledger and moves your level." },
    { icon: Flame, title: "Streaks that respect your timezone", body: "Your day is your day, wherever you happen to open the app." },
    { icon: CalendarClock, title: "Built to grow", body: "Projects, goals, habits and focus sessions are coming to the same foundation." },
  ];

  return (
    <main id="main" className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight text-ink">{APP_NAME}</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClassName({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClassName({ variant: "primary", size: "sm" })}>
            Get started
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 flex-col justify-center py-16">
        <p className="eyebrow mb-4">{APP_TAGLINE}</p>

        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
          Plan the day. Do the work.{" "}
          <span className="bg-gradient-to-r from-[var(--color-xp-from)] to-[var(--color-xp-to)] bg-clip-text text-transparent">
            Level up.
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">{APP_DESCRIPTION}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup" className={buttonClassName({ variant: "primary", size: "lg" })}>
            Create your account
          </Link>
          <Link href="/login" className={buttonClassName({ variant: "secondary", size: "lg" })}>
            I already have one
          </Link>
        </div>

        <ul className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2">
          {highlights.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-surface p-5">
              <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
              <h2 className="mt-3 text-[0.875rem] font-medium text-ink">{title}</h2>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">{body}</p>
            </li>
          ))}
        </ul>
      </div>

      <footer className="border-t border-line pt-6 text-[0.75rem] text-ink-faint">
        {APP_NAME} · Phase 1
      </footer>
    </main>
  );
}
