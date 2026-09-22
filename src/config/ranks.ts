/**
 * Ranks.
 *
 * A level is a number, and a number is not something anybody wants. A *rank*
 * is: it gives the next level a name worth arriving at, and it gives the
 * current one an identity to carry around the product ("Level 7 · Adept").
 *
 * Ranks are derived from the level, never stored — exactly like every other
 * progression figure here. Changing this table re-titles every account
 * instantly and cannot desynchronise from the XP ledger, because it reads
 * from it rather than duplicating it.
 *
 * The bands widen as they climb, matching the levelling curve underneath:
 * early ranks arrive quickly enough to teach the loop, later ones are far
 * enough apart to be worth the walk.
 */

export interface Rank {
  /** First level at which this rank applies. */
  readonly from: number;
  readonly title: string;
  /** One line, shown under the title on the player card. */
  readonly tagline: string;
  /** Tailwind classes for the rank chip. */
  readonly badgeClass: string;
  readonly textClass: string;
}

export const RANKS: readonly Rank[] = [
  {
    from: 1,
    title: "Novice",
    tagline: "Everything starts with one finished thing.",
    badgeClass: "border-line-strong bg-white/[0.04] text-ink-muted",
    textClass: "text-ink-muted",
  },
  {
    from: 3,
    title: "Apprentice",
    tagline: "The habit of finishing is forming.",
    badgeClass: "border-positive/30 bg-positive/10 text-positive",
    textClass: "text-positive",
  },
  {
    from: 5,
    title: "Adept",
    tagline: "You finish what you start.",
    badgeClass: "border-accent/35 bg-accent/12 text-accent-strong",
    textClass: "text-accent-strong",
  },
  {
    from: 8,
    title: "Specialist",
    tagline: "Consistency is doing the work for you now.",
    badgeClass: "border-[#4fd1e8]/35 bg-[#4fd1e8]/12 text-[#7fe0f0]",
    textClass: "text-[#7fe0f0]",
  },
  {
    from: 12,
    title: "Expert",
    tagline: "Most people stop long before here.",
    badgeClass: "border-gold/35 bg-gold/12 text-gold-strong",
    textClass: "text-gold-strong",
  },
  {
    from: 17,
    title: "Master",
    tagline: "The work and the day are the same shape.",
    badgeClass: "border-streak/40 bg-streak/12 text-streak",
    textClass: "text-streak",
  },
  {
    from: 23,
    title: "Grandmaster",
    tagline: "Momentum measured in months.",
    badgeClass: "border-critical/35 bg-critical/12 text-critical",
    textClass: "text-critical",
  },
  {
    from: 31,
    title: "Legend",
    tagline: "You are the reason the curve keeps going.",
    badgeClass:
      "border-gold/50 bg-gradient-to-r from-gold/20 to-streak/20 text-gold-strong",
    textClass: "text-gold-strong",
  },
];

/** The rank held at `level`. Levels below 1 are treated as level 1. */
export function getRank(level: number): Rank {
  const target = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  // Walk backwards to the first band that has started.
  for (let index = RANKS.length - 1; index >= 0; index -= 1) {
    const rank = RANKS[index] as Rank;
    if (target >= rank.from) return rank;
  }
  return RANKS[0] as Rank;
}

/** The next rank and the level it begins at, or null at the top of the table. */
export function getNextRank(level: number): { readonly rank: Rank; readonly atLevel: number } | null {
  const current = getRank(level);
  const index = RANKS.indexOf(current);
  const next = RANKS[index + 1];
  return next ? { rank: next, atLevel: next.from } : null;
}

/** True when reaching `level` also enters a new rank — the loud kind of level-up. */
export function isRankUp(level: number): boolean {
  return RANKS.some((rank) => rank.from === Math.floor(level));
}
