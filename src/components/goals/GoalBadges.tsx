import { CalendarClock, Target } from "lucide-react";
import Link from "next/link";
import { GOAL_STATUS_CONFIG } from "@/config/goals";
import { cn } from "@/lib/cn";
import type { GoalTiming } from "@/lib/goals/progress";
import type { GoalStatus } from "@/generated/prisma/enums";

/**
 * Goal status and identity chips.
 *
 * Each carries a glyph and a text label as well as a colour, so status never
 * depends on colour perception — the rule the priority and project badges
 * already follow.
 */
export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  const config = GOAL_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        config.badgeClass,
        className,
      )}
    >
      <span aria-hidden="true" className="text-[0.625rem] leading-none">
        {config.glyph}
      </span>
      <span className="sr-only">Status: </span>
      {config.label}
    </span>
  );
}

/**
 * The target-date chip.
 *
 * Its wording comes from `getGoalTiming`, which builds labels from fixed
 * strings and integers — never from a locale formatter, so Node and the
 * browser cannot disagree about them.
 */
export function GoalTargetBadge({ timing, className }: { timing: GoalTiming; className?: string }) {
  if (timing.state === "none") return null;

  const tone =
    timing.state === "overdue"
      ? "border-critical/30 bg-critical/10 text-critical"
      : timing.state === "due-today" || timing.state === "due-soon"
        ? "border-caution/30 bg-caution/10 text-caution"
        : "border-line bg-white/[0.02] text-ink-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        tone,
        className,
      )}
    >
      <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
      {timing.label}
    </span>
  );
}

/**
 * The goal breadcrumb shown on a project.
 *
 * Deliberately compact: a project is its own object, and this is context, not
 * a demotion. Links upward, completing the bidirectional path between the two.
 */
export function GoalChip({
  goalId,
  title,
  className,
}: {
  goalId: string;
  title: string;
  className?: string;
}) {
  return (
    <Link
      href={`/app/goals/${goalId}`}
      className={cn(
        "inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[0.6875rem] font-medium text-accent-strong",
        "transition-colors hover:border-accent/40 hover:bg-accent/15",
        className,
      )}
    >
      <Target className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Goal: </span>
      <span className="truncate">{title}</span>
    </Link>
  );
}
