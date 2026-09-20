import type { Route } from "next";
import Link from "next/link";
import { CALENDAR_ANCHOR_LABEL, CALENDAR_KIND_CONFIG } from "@/config/calendar";
import { getAccentColor } from "@/config/colors";
import { formatTime, type LocalDate } from "@/lib/datetime";
import { isItemOverdue } from "@/lib/calendar/items";
import type { CalendarItem } from "@/lib/calendar/types";
import { cn } from "@/lib/cn";

/**
 * One item on the grid.
 *
 * Every chip links to the record it was read from — a project, a goal or the
 * task list. There is nowhere else for it to go: the calendar holds no record
 * of its own that could be opened.
 *
 * `href` is cast to `Route` here, in the one place it is consumed. The value
 * is built in the query layer from ids the database returned, and typed routes
 * cannot narrow a string that was assembled at runtime.
 */
export function CalendarItemChip({
  item,
  today,
  compact = false,
}: {
  item: CalendarItem;
  today: LocalDate;
  compact?: boolean;
}) {
  const kind = CALENDAR_KIND_CONFIG[item.kind];
  const accent = item.color ? getAccentColor(item.color) : null;
  const overdue = isItemOverdue(item, today);

  // Redundant with colour on purpose: the state has to survive a greyscale
  // print and a colour-vision difference (WCAG 1.4.1).
  const stateLabel = item.completed
    ? "Completed"
    : overdue
      ? "Overdue"
      : CALENDAR_ANCHOR_LABEL[item.anchor];

  const label = [
    kind.label,
    stateLabel.toLowerCase(),
    item.time ? `at ${formatTime(item.time)}` : "all day",
    item.title,
    item.context ? `in ${item.context}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={item.href as Route}
      aria-label={label}
      title={label}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-[6px] border border-transparent px-1.5 py-1 text-left",
        "transition-colors hover:border-line hover:bg-white/[0.04]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        compact ? "text-[0.6875rem]" : "text-[0.8125rem]",
        item.completed && "opacity-55",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          accent?.dotClass ?? kind.dotClass,
          item.anchor === "start" && "ring-1 ring-inset ring-base",
        )}
      />
      {item.time && (
        <span className="tnum shrink-0 text-ink-faint">{formatTime(item.time)}</span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          item.completed ? "text-ink-faint line-through" : "text-ink-muted group-hover:text-ink",
          overdue && !item.completed && "text-critical",
        )}
      >
        {item.title}
      </span>
      {!compact && item.anchor === "start" && (
        <span className="shrink-0 text-[0.6875rem] text-ink-faint">Starts</span>
      )}
    </Link>
  );
}
