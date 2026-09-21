import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A titled section of the day.
 *
 * A real `<section>` with a real heading, so the page has an outline a screen
 * reader can jump through rather than a stack of styled `div`s.
 */
export function TodaySection({
  id,
  title,
  count,
  note,
  tone = "default",
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  note?: ReactNode;
  tone?: "default" | "critical";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${id}-heading`}
          className={cn(
            "eyebrow",
            // Overdue reads as urgent through wording and placement as much as
            // colour; the tint is a reinforcement, never the only signal.
            tone === "critical" && "text-critical",
          )}
        >
          {title}
          {count !== undefined && count > 0 && (
            <span className="tnum ml-2 font-normal text-ink-faint">{count}</span>
          )}
        </h2>
        {action}
      </div>
      {note && <p className="text-[0.8125rem] text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}
