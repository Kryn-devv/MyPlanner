/**
 * The shared accent palette.
 *
 * Categories (Phase 1) and projects (Phase 2) both need a small visual
 * identifier, and they should not drift apart into two palettes. Colours are
 * stored as *tokens* rather than hex values so they stay theme-aware, and the
 * set is deliberately closed — letting users pick arbitrary CSS colours is how
 * you end up with unreadable text on a dark surface.
 *
 * Every entry is checked to carry enough contrast against the app's surfaces
 * at the opacities used below.
 */
export interface AccentColorToken {
  readonly value: string;
  readonly label: string;
  /** Solid swatch, for dots and bullets. */
  readonly dotClass: string;
  /** Bordered translucent surface, for badges. */
  readonly badgeClass: string;
  /** Solid fill for progress rails and rails on cards. */
  readonly fillClass: string;
  /** Text-only treatment. */
  readonly textClass: string;
}

export const ACCENT_COLORS: readonly AccentColorToken[] = [
  {
    value: "slate",
    label: "Slate",
    dotClass: "bg-slate-400",
    badgeClass: "border-slate-400/20 bg-slate-400/10 text-slate-300",
    fillClass: "bg-slate-400",
    textClass: "text-slate-300",
  },
  {
    value: "violet",
    label: "Violet",
    dotClass: "bg-violet-400",
    badgeClass: "border-violet-400/20 bg-violet-400/10 text-violet-300",
    fillClass: "bg-violet-400",
    textClass: "text-violet-300",
  },
  {
    value: "cyan",
    label: "Cyan",
    dotClass: "bg-cyan-400",
    badgeClass: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
    fillClass: "bg-cyan-400",
    textClass: "text-cyan-300",
  },
  {
    value: "emerald",
    label: "Emerald",
    dotClass: "bg-emerald-400",
    badgeClass: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    fillClass: "bg-emerald-400",
    textClass: "text-emerald-300",
  },
  {
    value: "amber",
    label: "Amber",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    fillClass: "bg-amber-400",
    textClass: "text-amber-300",
  },
  {
    value: "rose",
    label: "Rose",
    dotClass: "bg-rose-400",
    badgeClass: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    fillClass: "bg-rose-400",
    textClass: "text-rose-300",
  },
  {
    value: "indigo",
    label: "Indigo",
    dotClass: "bg-indigo-400",
    badgeClass: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300",
    fillClass: "bg-indigo-400",
    textClass: "text-indigo-300",
  },
  {
    value: "teal",
    label: "Teal",
    dotClass: "bg-teal-400",
    badgeClass: "border-teal-400/20 bg-teal-400/10 text-teal-300",
    fillClass: "bg-teal-400",
    textClass: "text-teal-300",
  },
];

const FALLBACK_COLOR = ACCENT_COLORS[0] as AccentColorToken;

/** Falls back rather than throwing, so a stale token cannot break a page. */
export function getAccentColor(token: string | null | undefined): AccentColorToken {
  if (!token) return FALLBACK_COLOR;
  return ACCENT_COLORS.find((c) => c.value === token) ?? FALLBACK_COLOR;
}

export const ACCENT_COLOR_VALUES: readonly string[] = ACCENT_COLORS.map((c) => c.value);
