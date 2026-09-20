import type { Priority } from "@/generated/prisma/enums";

/**
 * Single source of truth for priority presentation and XP defaults.
 *
 * `shortLabel` and `Icon`-free `glyph` exist so that priority is never
 * communicated by colour alone (WCAG 1.4.1): every badge renders a text label
 * and a distinct shape.
 */
export interface PriorityConfig {
  readonly value: Priority;
  readonly label: string;
  readonly defaultXp: number;
  /** Non-colour redundant cue, rendered next to the label. */
  readonly glyph: string;
  /** Tailwind classes for the badge surface. */
  readonly badgeClass: string;
  /** Tailwind classes for the 2px rail on the left of a task card. */
  readonly railClass: string;
  /** Tailwind text colour for standalone icons. */
  readonly textClass: string;
  /** Sort weight — higher is more urgent. */
  readonly weight: number;
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  LOW: {
    value: "LOW",
    label: "Low",
    defaultXp: 10,
    glyph: "○",
    badgeClass: "border-slate-400/25 bg-slate-400/10 text-slate-300",
    railClass: "bg-slate-500/60",
    textClass: "text-slate-300",
    weight: 0,
  },
  MEDIUM: {
    value: "MEDIUM",
    label: "Medium",
    defaultXp: 20,
    glyph: "◐",
    badgeClass: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    railClass: "bg-sky-500/70",
    textClass: "text-sky-300",
    weight: 1,
  },
  HIGH: {
    value: "HIGH",
    label: "High",
    defaultXp: 40,
    glyph: "◑",
    badgeClass: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    railClass: "bg-amber-500/80",
    textClass: "text-amber-300",
    weight: 2,
  },
  URGENT: {
    value: "URGENT",
    label: "Urgent",
    defaultXp: 60,
    glyph: "◆",
    badgeClass: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    railClass: "bg-rose-500/90",
    textClass: "text-rose-300",
    weight: 3,
  },
};

export const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function getPriorityConfig(priority: Priority): PriorityConfig {
  return PRIORITY_CONFIG[priority];
}
