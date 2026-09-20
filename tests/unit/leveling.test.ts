import { describe, expect, it } from "vitest";
import {
  calculateLevel,
  getXpForNextLevel,
  getXpThresholdForLevel,
  LEVEL_STEP,
  MAX_LEVEL,
} from "@/lib/leveling";

describe("getXpThresholdForLevel", () => {
  it("starts level 1 at zero XP", () => {
    expect(getXpThresholdForLevel(1)).toBe(0);
  });

  it("follows the documented triangular curve", () => {
    expect(getXpThresholdForLevel(2)).toBe(100);
    expect(getXpThresholdForLevel(3)).toBe(300);
    expect(getXpThresholdForLevel(4)).toBe(600);
    expect(getXpThresholdForLevel(5)).toBe(1000);
    expect(getXpThresholdForLevel(10)).toBe(4500);
  });

  it("grows each level's cost by exactly LEVEL_STEP", () => {
    for (let level = 1; level < 50; level++) {
      const span = getXpThresholdForLevel(level + 1) - getXpThresholdForLevel(level);
      expect(span).toBe(LEVEL_STEP * level);
    }
  });
});

describe("calculateLevel", () => {
  it("returns level 1 for a brand new account", () => {
    expect(calculateLevel(0)).toBe(1);
  });

  it("is exact at every threshold boundary", () => {
    // Boundaries are where floating-point sqrt goes wrong, and are also the
    // values users actually land on.
    for (let level = 1; level <= 200; level++) {
      const threshold = getXpThresholdForLevel(level);
      expect(calculateLevel(threshold)).toBe(level);
      expect(calculateLevel(threshold - 1)).toBe(Math.max(1, level - 1));
      expect(calculateLevel(threshold + 1)).toBe(level);
    }
  });

  it("never decreases as XP increases", () => {
    let previous = 1;
    for (let xp = 0; xp < 20_000; xp += 7) {
      const level = calculateLevel(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("clamps hostile and nonsensical inputs to level 1", () => {
    expect(calculateLevel(-1)).toBe(1);
    expect(calculateLevel(-99_999)).toBe(1);
    expect(calculateLevel(Number.NaN)).toBe(1);
    expect(calculateLevel(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("caps at MAX_LEVEL rather than running away", () => {
    expect(calculateLevel(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it("ignores fractional XP", () => {
    expect(calculateLevel(99.9)).toBe(1);
    expect(calculateLevel(100.9)).toBe(2);
  });
});

describe("getXpForNextLevel", () => {
  it("reports a fresh account as starting the climb to level 2", () => {
    const progress = getXpForNextLevel(0);
    expect(progress).toMatchObject({
      level: 1,
      xpIntoLevel: 0,
      xpForLevel: 100,
      xpToNextLevel: 100,
      nextLevelAt: 100,
      percent: 0,
      isMaxLevel: false,
    });
  });

  it("reports progress within a level", () => {
    // Level 3 spans 300 -> 600.
    const progress = getXpForNextLevel(450);
    expect(progress.level).toBe(3);
    expect(progress.xpIntoLevel).toBe(150);
    expect(progress.xpForLevel).toBe(300);
    expect(progress.xpToNextLevel).toBe(150);
    expect(progress.percent).toBe(50);
  });

  it("resets to 0% the moment a level is reached", () => {
    const progress = getXpForNextLevel(300);
    expect(progress.level).toBe(3);
    expect(progress.xpIntoLevel).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("keeps the parts consistent with the total for arbitrary XP", () => {
    for (let xp = 0; xp < 12_000; xp += 13) {
      const p = getXpForNextLevel(xp);
      expect(getXpThresholdForLevel(p.level) + p.xpIntoLevel).toBe(xp);
      if (!p.isMaxLevel) {
        expect(p.xpIntoLevel + p.xpToNextLevel).toBe(p.xpForLevel);
        expect(p.nextLevelAt).toBe(xp + p.xpToNextLevel);
      }
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
    }
  });

  it("does not divide by zero at max level", () => {
    const progress = getXpForNextLevel(Number.MAX_SAFE_INTEGER);
    expect(progress.isMaxLevel).toBe(true);
    expect(progress.percent).toBe(100);
    expect(progress.xpToNextLevel).toBe(0);
    expect(Number.isFinite(progress.percent)).toBe(true);
  });

  it("treats negative XP as zero rather than producing a negative bar", () => {
    const progress = getXpForNextLevel(-500);
    expect(progress.level).toBe(1);
    expect(progress.percent).toBe(0);
    expect(progress.xpIntoLevel).toBe(0);
  });
});
