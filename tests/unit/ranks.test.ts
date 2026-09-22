import { describe, expect, it } from "vitest";
import { MAX_LEVEL } from "@/lib/leveling";
import { RANKS, getNextRank, getRank, isRankUp } from "@/config/ranks";

/**
 * Ranks are a pure function of the level, so they can be checked exhaustively
 * rather than sampled — every level from 1 to the ceiling, in one pass.
 */
describe("the rank table", () => {
  it("starts at level 1 and never goes backwards", () => {
    expect(RANKS[0]?.from).toBe(1);
    for (let index = 1; index < RANKS.length; index += 1) {
      expect(RANKS[index]!.from).toBeGreaterThan(RANKS[index - 1]!.from);
    }
  });

  it("gives every rank a distinct title", () => {
    expect(new Set(RANKS.map((rank) => rank.title)).size).toBe(RANKS.length);
  });
});

describe("getRank", () => {
  it("returns a rank for every level up to the ceiling", () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const rank = getRank(level);
      expect(rank.title).toBeTruthy();
      expect(level).toBeGreaterThanOrEqual(rank.from);
    }
  });

  it("holds a rank until the next band begins", () => {
    expect(getRank(1).title).toBe("Novice");
    expect(getRank(2).title).toBe("Novice");
    expect(getRank(3).title).toBe("Apprentice");
    expect(getRank(4).title).toBe("Apprentice");
    expect(getRank(5).title).toBe("Adept");
  });

  it("clamps a nonsensical level rather than failing", () => {
    expect(getRank(0).title).toBe("Novice");
    expect(getRank(-5).title).toBe("Novice");
    expect(getRank(Number.NaN).title).toBe("Novice");
    expect(getRank(7.9).title).toBe("Adept");
  });

  it("tops out at the last band", () => {
    const last = RANKS[RANKS.length - 1]!;
    expect(getRank(last.from).title).toBe(last.title);
    expect(getRank(MAX_LEVEL).title).toBe(last.title);
  });
});

describe("getNextRank", () => {
  it("names the rank ahead and the level it starts at", () => {
    expect(getNextRank(1)).toMatchObject({ atLevel: 3 });
    expect(getNextRank(1)?.rank.title).toBe("Apprentice");
    expect(getNextRank(4)?.rank.title).toBe("Adept");
  });

  it("is null once the table runs out", () => {
    expect(getNextRank(RANKS[RANKS.length - 1]!.from)).toBeNull();
    expect(getNextRank(MAX_LEVEL)).toBeNull();
  });

  it("always points strictly forwards", () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const next = getNextRank(level);
      if (next) expect(next.atLevel).toBeGreaterThan(level);
    }
  });
});

describe("isRankUp", () => {
  it("is true exactly on the levels that open a band", () => {
    for (let level = 1; level <= 40; level += 1) {
      expect(isRankUp(level)).toBe(RANKS.some((rank) => rank.from === level));
    }
  });
});
