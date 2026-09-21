import type { Route } from "next";
import Link from "next/link";
import { getAccentColor } from "@/config/colors";
import { MILESTONE_STATUS_CONFIG, PROJECT_STATUS_CONFIG } from "@/config/projects";
import { cn } from "@/lib/cn";
import type { MilestoneStatus, ProjectStatus } from "@/generated/prisma/enums";

/**
 * Status and identity chips.
 *
 * Each carries a glyph and a text label as well as a colour, so status never
 * depends on colour perception — the same rule the priority badges follow.
 */

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const config = PROJECT_STATUS_CONFIG[status];

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

export function MilestoneStatusBadge({
  status,
  className,
}: {
  status: MilestoneStatus;
  className?: string;
}) {
  const config = MILESTONE_STATUS_CONFIG[status];

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

/** The project chip shown on a task row. */
export function ProjectChip({
  name,
  color,
  milestone,
  href,
  className,
}: {
  name: string;
  color: string;
  milestone?: string | null;
  /** Makes the chip a link to the project. Omitted where it would self-link. */
  href?: string;
  className?: string;
}) {
  const token = getAccentColor(color);

  const chipClass = cn(
    "inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
    token.badgeClass,
    href &&
      "transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    className,
  );

  const content = (
    <>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", token.dotClass)} />
      <span className="sr-only">Project: </span>
      <span className="truncate">{name}</span>
      {milestone && (
        <>
          <span aria-hidden="true" className="opacity-50">
            /
          </span>
          <span className="sr-only">Milestone: </span>
          <span className="truncate opacity-80">{milestone}</span>
        </>
      )}
    </>
  );

  // A chip that names a project should be a way to reach it — but it stays a
  // span where there is nowhere to go, so a non-link never carries link
  // affordances it cannot honour.
  return href ? (
    // Cast for the same reason the calendar's chips do: typed routes cannot
    // narrow a path assembled at runtime from an id the database returned.
    <Link href={href as Route} className={chipClass}>
      {content}
    </Link>
  ) : (
    <span className={chipClass}>{content}</span>
  );
}

/** The square colour mark that identifies a project in lists and headers. */
export function ProjectMark({
  color,
  size = "md",
  className,
}: {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const token = getAccentColor(color);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[6px] border border-white/10",
        size === "sm" ? "h-5 w-5" : size === "lg" ? "h-9 w-9 rounded-[9px]" : "h-7 w-7",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-[3px]",
          token.fillClass,
          size === "sm" ? "h-2 w-2" : size === "lg" ? "h-3.5 w-3.5 rounded-[5px]" : "h-2.5 w-2.5",
        )}
      />
    </span>
  );
}
