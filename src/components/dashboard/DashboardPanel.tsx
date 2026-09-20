import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A titled dashboard section.
 *
 * `count` is rendered next to the title rather than as a badge so the eye
 * reads "TODAY 8/11" as one phrase.
 */
export function DashboardPanel({
  title,
  count,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string;
  count?: ReactNode;
  href?: Route;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`panel-${title.toLowerCase().replace(/\s+/g, "-")}`} className={cn("panel", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 id={`panel-${title.toLowerCase().replace(/\s+/g, "-")}`} className="eyebrow">
            {title}
          </h2>
          {count !== undefined && <span className="tnum text-[0.75rem] text-ink-muted">{count}</span>}
        </div>

        {href && (
          <Link
            href={href}
            className="group inline-flex items-center gap-1 rounded text-[0.75rem] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {linkLabel ?? "View all"}
            <ArrowRight
              className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </header>

      <div className="p-3">{children}</div>
    </section>
  );
}
