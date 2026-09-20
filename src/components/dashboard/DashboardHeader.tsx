import { formatLongDate, type LocalDate } from "@/lib/datetime";

/**
 * The greeting line.
 *
 * Both the greeting and the date are resolved server-side in the user's
 * timezone, so the page is correct in its first paint rather than flickering
 * from a server-rendered guess to a client correction.
 */
export function DashboardHeader({
  greeting,
  name,
  today,
}: {
  greeting: string;
  name: string;
  today: LocalDate;
}) {
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
        {greeting}, {firstName}
      </h1>
      <p className="mt-1 text-[0.875rem] text-ink-muted">{formatLongDate(today)}</p>
    </div>
  );
}
