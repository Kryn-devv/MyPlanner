import { ACCENT_COLORS, ACCENT_COLOR_VALUES, getAccentColor, type AccentColorToken } from "./colors";

/**
 * Category colours come from the shared accent palette (src/config/colors.ts),
 * which projects use too — one palette, so the two never drift apart.
 *
 * Nothing in business logic may branch on a category *name*, only on its id:
 * users rename and reorganise categories freely.
 */
export type CategoryColorToken = AccentColorToken;

export const CATEGORY_COLORS = ACCENT_COLORS;
export const CATEGORY_COLOR_VALUES = ACCENT_COLOR_VALUES;
export const getCategoryColor = getAccentColor;

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
