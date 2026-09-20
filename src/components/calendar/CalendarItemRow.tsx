import type { Route } from "next";
import Link from "next/link";
import { CALENDAR_ANCHOR_LABEL, CALENDAR_KIND_CONFIG } from "@/config/calendar";
import { getAccentColor } from "@/config/colors";
import { getPriorityConfig } from "@/config/priorities";
import { formatTime, type LocalDate } from "@/lib/datetime";
import { isItemOverdue } from "@/lib/calendar/items";
import type { CalendarItem } from "@/lib/calendar/types";
import { cn } from "@/lib/cn";

/**
 * The full-width form of a calendar item, used by the day, week and timeline
 * views where there is room for provenance.
 *
 * Read-only by design for this phase. The row links to the record it came
 * from and changes nothing: rescheduling happens where the date lives, so
 * there is exactly one place a due date can be edited.
 */
export function CalendarItemRow({ item, today }: { item: CalendarItem; today: LocalDate }) {
  const kind = CALENDAR_KIND_CONFIG[item.kind];
  const accent = item.color ? getAccentColor(item.color) : null;
  const overdue = isItemOverdue(item, today);
  const Icon = kind.icon;

  return (
    <Link
      href={item.href as Route}
      className={cn(
        "group flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-panel px-3 py-2.5",
        "transition-colors hover:border-line-strong hover:bg-white/[0.03]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        item.completed && "opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border",
          accent?.badgeClass ?? kind.badgeClass,
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-[0.875rem] font-medium",
              item.completed ? "text-ink-faint line-through" : "text-ink",
            )}
          >
            {item.title}
          </span>
          {item.time && (
            <span className="tnum text-[0.75rem] text-ink-muted">{formatTime(item.time)}</span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-ink-faint">
          {/* Kind and state are spelled out, never colour-only. */}
          <span className={cn("inline-flex items-center gap-1", kind.textClass)}>
            <span aria-hidden="true">{kind.glyph}</span>
            {kind.label}
          </span>
          <span aria-hidden="true">·</span>
          <span className={cn(overdue && !item.completed && "text-critical")}>
            {item.completed
              ? "Completed"
              : overdue
                ? "Overdue"
                : CALENDAR_ANCHOR_LABEL[item.anchor]}
          </span>
          {item.priority && (
            <>
              <span aria-hidden="true">·</span>
              <span className={getPriorityConfig(item.priority).textClass}>
                {getPriorityConfig(item.priority).label}
              </span>
            </>
          )}
          {item.context && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{item.context}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
