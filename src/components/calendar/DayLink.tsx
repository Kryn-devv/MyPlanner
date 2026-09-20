import Link from "next/link";
import type { ReactNode } from "react";
import type { LocalDate } from "@/lib/datetime";

/**
 * A link that opens one day in the day view, carrying the current filters.
 *
 * Built as a `UrlObject` rather than a template string: typed routes cannot
 * check a query string that was concatenated by hand, and the filters have to
 * survive the jump or the day view would quietly show more than the month did.
 */
export function DayLink({
  date,
  query,
  className,
  children,
}: {
  date: LocalDate;
  query: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={{ pathname: "/app/calendar", query: { ...query, view: "day", date } }}
      className={className}
    >
      {children}
    </Link>
  );
}
