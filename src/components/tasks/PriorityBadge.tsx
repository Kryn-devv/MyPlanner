import { getPriorityConfig } from "@/config/priorities";
import { cn } from "@/lib/cn";
import type { Priority } from "@/generated/prisma/enums";

/**
 * Priority is communicated three ways — a glyph, a text label and a colour —
 * so it survives colour blindness and greyscale (WCAG 1.4.1).
 */
export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const config = getPriorityConfig(priority);

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
      <span className="sr-only">Priority: </span>
      {config.label}
    </span>
  );
}

/** The vertical rail on the left edge of a task card. Purely decorative. */
export function PriorityRail({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 left-0 w-[2px] rounded-l-[inherit]",
        getPriorityConfig(priority).railClass,
        className,
      )}
    />
  );
}
