/**
 * Category colours are stored as tokens, not hex values, so a category keeps
 * working if the theme changes. Users create their own categories, so nothing
 * in business logic may branch on a category *name* — only on its id.
 */
export interface CategoryColorToken {
  readonly value: string;
  readonly label: string;
  readonly dotClass: string;
  readonly badgeClass: string;
}

export const CATEGORY_COLORS: readonly CategoryColorToken[] = [
  { value: "slate", label: "Slate", dotClass: "bg-slate-400", badgeClass: "border-slate-400/20 bg-slate-400/10 text-slate-300" },
  { value: "violet", label: "Violet", dotClass: "bg-violet-400", badgeClass: "border-violet-400/20 bg-violet-400/10 text-violet-300" },
  { value: "cyan", label: "Cyan", dotClass: "bg-cyan-400", badgeClass: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300" },
  { value: "emerald", label: "Emerald", dotClass: "bg-emerald-400", badgeClass: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
  { value: "amber", label: "Amber", dotClass: "bg-amber-400", badgeClass: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
  { value: "rose", label: "Rose", dotClass: "bg-rose-400", badgeClass: "border-rose-400/20 bg-rose-400/10 text-rose-300" },
  { value: "indigo", label: "Indigo", dotClass: "bg-indigo-400", badgeClass: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300" },
  { value: "teal", label: "Teal", dotClass: "bg-teal-400", badgeClass: "border-teal-400/20 bg-teal-400/10 text-teal-300" },
];

const FALLBACK_COLOR = CATEGORY_COLORS[0] as CategoryColorToken;

export function getCategoryColor(token: string | null | undefined): CategoryColorToken {
  if (!token) return FALLBACK_COLOR;
  return CATEGORY_COLORS.find((c) => c.value === token) ?? FALLBACK_COLOR;
}

export const CATEGORY_COLOR_VALUES: readonly string[] = CATEGORY_COLORS.map((c) => c.value);

/**
 * Suggested starting set, applied once at sign-up. These are seeds for a new
 * account, not a fixed taxonomy — users add, rename and remove freely.
 */
export const DEFAULT_CATEGORIES: readonly { name: string; color: string }[] = [
  { name: "Study", color: "violet" },
  { name: "Coding", color: "cyan" },
  { name: "Robotics", color: "amber" },
  { name: "Personal", color: "emerald" },
  { name: "School", color: "indigo" },
  { name: "Projects", color: "rose" },
];
