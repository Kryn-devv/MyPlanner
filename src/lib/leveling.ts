/**
 * Level progression.
 *
 * Curve: the XP required to advance *from* level L *to* L+1 is
 *
 *     step(L) = LEVEL_STEP * L            (100, 200, 300, ...)
 *
 * so the cumulative XP needed to *reach* level L is the triangular number
 *
 *     threshold(L) = LEVEL_STEP / 2 * L * (L - 1)   (0, 100, 300, 600, 1000, ...)
 *
 * One closed-form formula, no table of hand-written levels. The curve is
 * gentle early (a couple of urgent tasks is a level) and stretches out later,
 * which is what keeps a progression system motivating rather than grindy.
 */

/** XP added to each successive level's requirement. */
export const LEVEL_STEP = 100;

/** Defensive ceiling so a corrupt/huge XP value cannot spin the solver. */
export const MAX_LEVEL = 999;

/** Total XP required to have reached `level`. Level 1 starts at 0 XP. */
export function getXpThresholdForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (LEVEL_STEP / 2) * l * (l - 1);
}

/**
 * The level a given lifetime XP total corresponds to.
 *
 * Solved in closed form, then corrected with bounded loops: floating-point
 * sqrt is off by one exactly at threshold boundaries, and those boundaries are
 * the values users actually land on.
 */
export function calculateLevel(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp <= 0) return 1;

  const xp = Math.floor(totalXp);

  // Invert threshold(L) <= xp  =>  L <= (1 + sqrt(1 + 8*xp/LEVEL_STEP)) / 2
  let level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / LEVEL_STEP)) / 2);
  level = Math.min(Math.max(level, 1), MAX_LEVEL);

  while (level < MAX_LEVEL && getXpThresholdForLevel(level + 1) <= xp) level++;
  while (level > 1 && getXpThresholdForLevel(level) > xp) level--;

  return level;
}

export interface LevelProgress {
  readonly level: number;
  /** Lifetime XP. */
  readonly totalXp: number;
  /** XP earned since entering the current level. */
  readonly xpIntoLevel: number;
  /** XP needed to span the current level, start to finish. */
  readonly xpForLevel: number;
  /** XP still needed to reach the next level. */
  readonly xpToNextLevel: number;
  /** Lifetime XP at which the next level unlocks. */
  readonly nextLevelAt: number;
  /** 0–100, rounded, for progress bars. */
  readonly percent: number;
  /** True once MAX_LEVEL is reached and there is nothing further to earn. */
  readonly isMaxLevel: boolean;
}

/**
 * Everything the XP bar needs, derived from a single lifetime total.
 *
 * Named `getXpForNextLevel` in the brief; exported under both names so the
 * intent-revealing one is available too.
 */
export function getXpForNextLevel(totalXp: number): LevelProgress {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const level = calculateLevel(xp);
  const isMaxLevel = level >= MAX_LEVEL;

  const levelStart = getXpThresholdForLevel(level);
  const levelEnd = isMaxLevel ? levelStart : getXpThresholdForLevel(level + 1);

  const xpForLevel = isMaxLevel ? 0 : levelEnd - levelStart;
  const xpIntoLevel = xp - levelStart;
  const xpToNextLevel = isMaxLevel ? 0 : levelEnd - xp;

  const percent = isMaxLevel
    ? 100
    : Math.min(100, Math.max(0, Math.round((xpIntoLevel / xpForLevel) * 100)));

  return {
    level,
    totalXp: xp,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel,
    nextLevelAt: levelEnd,
    percent,
    isMaxLevel,
  };
}

export { getXpForNextLevel as getLevelProgress };
