import { Lock } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { buttonClassName } from "@/components/ui/Button";
import { PageHeader } from "./PageHeader";

/**
 * Placeholder for a destination that exists in the navigation but not yet in
 * the product.
 *
 * A real page rather than a disabled link: the route resolves, the back button
 * works, and it explains what is coming instead of dead-ending.
 */
export function ComingSoon({
  title,
  summary,
  icon: Icon,
}: {
  title: string;
  summary?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Coming in a future phase" title={title} />

      <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div
          aria-hidden="true"
          className="relative grid h-14 w-14 place-items-center rounded-2xl border border-line bg-white/[0.02]"
        >
          <Icon className="h-6 w-6 text-ink-faint" />
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-line bg-elevated">
            <Lock className="h-2.5 w-2.5 text-ink-faint" />
          </span>
        </div>

        <h2 className="mt-1 text-base font-medium text-ink">{title} is not built yet</h2>

        {summary && <p className="max-w-sm text-[0.875rem] leading-relaxed text-ink-muted">{summary}</p>}

        <p className="max-w-sm text-[0.8125rem] text-ink-faint">
          {APP_NAME} is shipping in phases. Tasks, priorities, deadlines and progression are live
          today — this arrives in a later one.
        </p>

        <Link href="/app" className={buttonClassName({ variant: "secondary", size: "sm", className: "mt-3" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
