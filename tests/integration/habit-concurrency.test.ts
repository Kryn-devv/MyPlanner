import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  completeHabit,
  setHabitStatus,
  undoHabitCompletion,
  updateHabit,
} from "@/lib/habits/service";
import {
  createTestHabit,
  createTestUser,
  db,
  getHabit,
  getHabitLedgerRows,
  getLedgerTotal,
  getStats,
  listHabitCompletionDates,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Races.
 *
 * A double-tap, a retried request, two tabs open at once — all of these issue
 * the same operation twice at nearly the same moment. Every case here fires
 * the real operations concurrently and asserts that the database settles them:
 * the unique key on (habitId, completedDate) for completion, compare-and-swap
 * for undo and for status changes.
 *
 * The invariant checked after every race is the same one the ledger has kept
 * since Phase 1: `UserStats.totalXp` equals the sum of the user's ledger rows,
 * and one occurrence has at most one AWARD.
 */
const TODAY = "2026-09-23";
const NOW = new Date("2026-09-23T12:00:00.000Z");
const TZ = "UTC";
const XP = 25;

let user: TestUser;
let habitId: string;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
  habitId = (await createTestHabit(user.id, { xpReward: XP, startDate: "2026-09-01" })).id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

/** Runs the promises concurrently and splits them into wins and refusals. */
async function race<T>(promises: readonly Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  return {
    fulfilled: results
      .filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === "fulfilled")
      .map((r) => r.value),
    rejected: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason as Error),
  };
}

/** The ledger is the source of truth; the cached total must agree with it. */
async function expectLedgerConsistent(): Promise<number> {
  const total = await getLedgerTotal(user.id);
  expect((await getStats(user.id)).totalXp).toBe(total);
  return total;
}

describe("ten simultaneous completions of the same day", () => {
  it("produces one completion and one award", async () => {
    const { fulfilled, rejected } = await race(
      Array.from({ length: 10 }, () => completeHabit(user.id, habitId, TODAY, TZ, NOW)),
    );

    expect(rejected).toHaveLength(0);
    // Exactly one request did the work; the other nine were told it was done.
    expect(fulfilled.filter((o) => o.changed)).toHaveLength(1);
    expect(fulfilled.filter((o) => !o.changed)).toHaveLength(9);
    expect(fulfilled.reduce((sum, o) => sum + o.xpDelta, 0)).toBe(XP);

    expect(await listHabitCompletionDates(habitId)).toEqual([TODAY]);
    const ledger = await getHabitLedgerRows(user.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.amount).toBe(XP);
    expect(await expectLedgerConsistent()).toBe(XP);
  });

  it("reports the settled total to every caller, winner or not", async () => {
    const { fulfilled } = await race(
      Array.from({ length: 10 }, () => completeHabit(user.id, habitId, TODAY, TZ, NOW)),
    );

    // Nobody is told the day is unrecorded or that they owe zero XP overall.
    for (const outcome of fulfilled) expect(outcome.totalXp).toBe(XP);
  });

  it("awards each distinct day once when different days race", async () => {
    const days = ["2026-09-21", "2026-09-22", TODAY];
    const { fulfilled, rejected } = await race(
      days.flatMap((day) => [
        completeHabit(user.id, habitId, day, TZ, NOW),
        completeHabit(user.id, habitId, day, TZ, NOW),
      ]),
    );

    expect(rejected).toHaveLength(0);
    expect(fulfilled.filter((o) => o.changed)).toHaveLength(3);
    expect(await listHabitCompletionDates(habitId)).toEqual(days);
    // Three awards, and the cache kept up with all three increments.
    expect(await getHabitLedgerRows(user.id)).toHaveLength(3);
    expect(await expectLedgerConsistent()).toBe(3 * XP);
  });

  it("keeps two habits' simultaneous awards from overwriting each other", async () => {
    const second = await createTestHabit(user.id, { name: "Second", xpReward: XP });

    await race([
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
      completeHabit(user.id, second.id, TODAY, TZ, NOW),
    ]);

    expect(await expectLedgerConsistent()).toBe(2 * XP);
  });
});

describe("complete against undo", () => {
  it("ends in a state whose XP matches whether the day is recorded", async () => {
    await race([
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
      undoHabitCompletion(user.id, habitId, TODAY, NOW),
    ]);

    const days = await listHabitCompletionDates(habitId);
    const total = await expectLedgerConsistent();
    // Either ordering is valid — what is not valid is XP without a completion
    // row, or a completion row that was never paid for.
    expect(total).toBe(days.length === 1 ? XP : 0);
  });

  it("survives repeated toggling without drifting", async () => {
    for (let round = 0; round < 5; round += 1) {
      await race([
        completeHabit(user.id, habitId, TODAY, TZ, NOW),
        undoHabitCompletion(user.id, habitId, TODAY, NOW),
        completeHabit(user.id, habitId, TODAY, TZ, NOW),
      ]);
      const days = await listHabitCompletionDates(habitId);
      expect(await expectLedgerConsistent()).toBe(days.length === 1 ? XP : 0);
    }
  });

  it("reverses once when two undos race", async () => {
    await completeHabit(user.id, habitId, TODAY, TZ, NOW);

    const { fulfilled } = await race([
      undoHabitCompletion(user.id, habitId, TODAY, NOW),
      undoHabitCompletion(user.id, habitId, TODAY, NOW),
    ]);

    expect(fulfilled.filter((o) => o.changed)).toHaveLength(1);
    expect(await listHabitCompletionDates(habitId)).toEqual([]);
    const reversals = (await getHabitLedgerRows(user.id)).filter((r) => r.kind === "REVERSAL");
    expect(reversals).toHaveLength(1);
    expect(await expectLedgerConsistent()).toBe(0);
  });
});

describe("archive against complete", () => {
  it("leaves the habit archived with XP that matches its history", async () => {
    await race<unknown>([
      setHabitStatus(user.id, habitId, "ARCHIVED", TODAY, NOW),
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
    ]);

    expect((await getHabit(habitId)).status).toBe("ARCHIVED");

    const days = await listHabitCompletionDates(habitId);
    const total = await expectLedgerConsistent();
    // Completing just before the archive lands is legitimate; being paid for a
    // day that was never recorded is not.
    expect(total).toBe(days.length === 1 ? XP : 0);
  });

  it("settles two simultaneous archives into one transition", async () => {
    const { fulfilled, rejected } = await race([
      setHabitStatus(user.id, habitId, "ARCHIVED", TODAY, NOW),
      setHabitStatus(user.id, habitId, "ARCHIVED", TODAY, NOW),
    ]);

    // One request transitions the habit; the loser is refused by the
    // compare-and-swap rather than transitioning it a second time.
    expect(fulfilled.filter((o) => o.changed)).toHaveLength(1);
    expect(rejected.length).toBeLessThanOrEqual(1);
    const stored = await getHabit(habitId);
    expect(stored.status).toBe("ARCHIVED");
    // One transition means one pause interval, not two.
    expect(stored.pauses).toHaveLength(1);
  });
});

describe("pause against complete", () => {
  it("leaves the habit paused with XP that matches its history", async () => {
    await race<unknown>([
      setHabitStatus(user.id, habitId, "PAUSED", TODAY, NOW),
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
    ]);

    expect((await getHabit(habitId)).status).toBe("PAUSED");

    const days = await listHabitCompletionDates(habitId);
    expect(await expectLedgerConsistent()).toBe(days.length === 1 ? XP : 0);
  });

  it("opens exactly one pause when pause and resume race", async () => {
    await setHabitStatus(user.id, habitId, "PAUSED", "2026-09-21", NOW);

    await race([
      setHabitStatus(user.id, habitId, "ACTIVE", TODAY, NOW),
      setHabitStatus(user.id, habitId, "ACTIVE", TODAY, NOW),
    ]);

    const stored = await getHabit(habitId);
    expect(stored.status).toBe("ACTIVE");
    expect(stored.pauses).toHaveLength(1);
    expect(stored.pauses[0]?.endDate).not.toBeNull();
  });
});

describe("editing the recurrence against completing", () => {
  it("never leaves XP for a completion that was not recorded", async () => {
    // Narrowing the schedule to Mondays while today — a Wednesday — is ticked.
    await race<unknown>([
      updateHabit(user.id, habitId, {
        name: "Narrowed",
        description: null,
        frequency: "WEEKDAYS",
        weekdays: [1],
        weeklyTarget: null,
        xpReward: XP,
        startDate: "2026-09-01",
        endDate: null,
      }),
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
    ]);

    const days = await listHabitCompletionDates(habitId);
    const total = await expectLedgerConsistent();
    expect(total).toBe(days.length === 1 ? XP : 0);
    // Whichever won, the edit stands: the schedule is not rolled back by a tick.
    expect((await getHabit(habitId)).frequency).toBe("WEEKDAYS");
  });

  it("pays the reward the habit had when the day was ticked", async () => {
    await race<unknown>([
      updateHabit(user.id, habitId, {
        name: "Repriced",
        description: null,
        frequency: "DAILY",
        weekdays: [],
        weeklyTarget: null,
        xpReward: 900,
        startDate: "2026-09-01",
        endDate: null,
      }),
      completeHabit(user.id, habitId, TODAY, TZ, NOW),
    ]);

    const ledger = await getHabitLedgerRows(user.id);
    expect(ledger).toHaveLength(1);
    // One of the two stored rewards, never a mix of both or a doubled sum.
    expect([XP, 900]).toContain(ledger[0]?.amount);
    expect(await expectLedgerConsistent()).toBe(ledger[0]?.amount ?? 0);
  });
});
