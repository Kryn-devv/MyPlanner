import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import {
  getHabitDetail,
  getHabitStatusCounts,
  getHabits,
  getHabitsForDay,
} from "@/lib/habits/queries";
import { setHabitCompletionAction, setHabitStatusAction } from "@/lib/habits/actions";
import {
  completeHabit,
  setHabitStatus,
  undoHabitCompletion,
  updateHabit,
} from "@/lib/habits/service";
import {
  createTestHabit,
  createTestHabitCompletion,
  createTestUser,
  db,
  getHabit,
  getHabitLedgerRows,
  getStats,
  listHabitCompletionDates,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Cross-user isolation.
 *
 * A habit id travels through the browser, so every operation that takes one is
 * a chance to tick, pause, archive or read somebody else's habit — and to mint
 * XP into somebody else's account. Each case gives two users an equivalent
 * setup and asserts that neither can reach the other's, and that a foreign id
 * is answered exactly as one that never existed, so ids stay un-enumerable.
 */
const TODAY = "2026-09-23";
const NOW = new Date("2026-09-23T12:00:00.000Z");
const TZ = "UTC";
const FICTIONAL = "clfictional0000000000000";

const EDIT = {
  name: "Taken over",
  description: null,
  frequency: "DAILY" as const,
  weekdays: [] as number[],
  weeklyTarget: null,
  xpReward: 999,
  startDate: "2026-09-01",
  endDate: null,
};

let owner: TestUser;
let intruder: TestUser;
let ownerHabitId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await createTestUser();
  intruder = await createTestUser();
  ownerHabitId = (await createTestHabit(owner.id, {
    name: "Owner habit",
    xpReward: 25,
    startDate: "2026-09-01",
  })).id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("a foreign habit cannot be written", () => {
  it("cannot be edited", async () => {
    await expect(updateHabit(intruder.id, ownerHabitId, EDIT)).rejects.toBeInstanceOf(NotFoundError);

    const stored = await getHabit(ownerHabitId);
    expect(stored.name).toBe("Owner habit");
    expect(stored.xpReward).toBe(25);
  });

  it("cannot be completed", async () => {
    await expect(
      completeHabit(intruder.id, ownerHabitId, TODAY, TZ, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await listHabitCompletionDates(ownerHabitId)).toEqual([]);
    // And no XP landed in either account.
    expect((await getStats(intruder.id)).totalXp).toBe(0);
    expect((await getStats(owner.id)).totalXp).toBe(0);
    expect(await getHabitLedgerRows(intruder.id)).toHaveLength(0);
  });

  it("cannot be un-completed", async () => {
    await completeHabit(owner.id, ownerHabitId, TODAY, TZ, NOW);

    await expect(
      undoHabitCompletion(intruder.id, ownerHabitId, TODAY, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await listHabitCompletionDates(ownerHabitId)).toEqual([TODAY]);
    expect((await getStats(owner.id)).totalXp).toBe(25);
    expect((await getStats(intruder.id)).totalXp).toBe(0);
  });

  it("cannot be paused or archived", async () => {
    for (const status of ["PAUSED", "ARCHIVED"] as const) {
      await expect(
        setHabitStatus(intruder.id, ownerHabitId, status, TODAY, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    }

    const stored = await getHabit(ownerHabitId);
    expect(stored.status).toBe("ACTIVE");
    expect(stored.pauses).toHaveLength(0);
  });

  it("cannot be restored from someone else's archive", async () => {
    await setHabitStatus(owner.id, ownerHabitId, "ARCHIVED", TODAY, NOW);

    await expect(
      setHabitStatus(intruder.id, ownerHabitId, "ACTIVE", TODAY, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect((await getHabit(ownerHabitId)).status).toBe("ARCHIVED");
  });
});

describe("a foreign habit cannot be read", () => {
  it("is absent from the list, the day and the counts", async () => {
    expect(await getHabits(intruder.id, TZ, { status: "ALL", search: null }, NOW)).toEqual([]);
    expect(await getHabitsForDay(intruder.id, TODAY, TODAY)).toEqual([]);
    expect(await getHabitStatusCounts(intruder.id)).toEqual({
      ACTIVE: 0,
      PAUSED: 0,
      ARCHIVED: 0,
      ALL: 0,
    });

    // The owner sees exactly one, so the fixtures are not simply empty.
    expect(await getHabits(owner.id, TZ, { status: "ALL", search: null }, NOW)).toHaveLength(1);
  });

  it("has no detail page for anyone else", async () => {
    await createTestHabitCompletion(ownerHabitId, "2026-09-22");

    expect(await getHabitDetail(intruder.id, ownerHabitId, TZ, NOW)).toBeNull();
    expect(await getHabitDetail(owner.id, ownerHabitId, TZ, NOW)).not.toBeNull();
  });

  it("does not leak through a search that matches its name", async () => {
    const found = await getHabits(intruder.id, TZ, { status: "ALL", search: "Owner" }, NOW);
    expect(found).toEqual([]);
  });

  it("does not leak its completions into another user's history", async () => {
    await createTestHabitCompletion(ownerHabitId, "2026-09-22");
    const intruderHabit = await createTestHabit(intruder.id, {
      name: "Intruder habit",
      startDate: "2026-09-01",
    });

    const detail = await getHabitDetail(intruder.id, intruderHabit.id, TZ, NOW);
    expect(detail?.completionCount).toBe(0);
    expect(detail?.recent).toEqual([]);
    expect(detail?.streaks.current).toBe(0);
  });
});

describe("refusals are indistinguishable", () => {
  it("answers a foreign id exactly as an id that never existed", async () => {
    const foreign = await completeHabit(intruder.id, ownerHabitId, TODAY, TZ, NOW).catch((e) => e);
    const fictional = await completeHabit(intruder.id, FICTIONAL, TODAY, TZ, NOW).catch((e) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(fictional).toBeInstanceOf(NotFoundError);
    // Identical message: the response must not confirm that the id is real.
    expect((foreign as Error).message).toBe((fictional as Error).message);
  });

  it("does the same for edits, status changes and the detail read", async () => {
    const pairs = await Promise.all([
      Promise.all([
        updateHabit(intruder.id, ownerHabitId, EDIT).catch((e: Error) => e.message),
        updateHabit(intruder.id, FICTIONAL, EDIT).catch((e: Error) => e.message),
      ]),
      Promise.all([
        setHabitStatus(intruder.id, ownerHabitId, "ARCHIVED", TODAY, NOW).catch(
          (e: Error) => e.message,
        ),
        setHabitStatus(intruder.id, FICTIONAL, "ARCHIVED", TODAY, NOW).catch(
          (e: Error) => e.message,
        ),
      ]),
    ]);

    for (const [foreign, fictional] of pairs) expect(foreign).toBe(fictional);

    // The detail read returns the same "nothing here" for both.
    expect(await getHabitDetail(intruder.id, ownerHabitId, TZ, NOW)).toBeNull();
    expect(await getHabitDetail(intruder.id, FICTIONAL, TZ, NOW)).toBeNull();
  });
});

describe("XP stays with its owner", () => {
  it("credits the habit's owner, never the caller of a foreign id", async () => {
    await completeHabit(owner.id, ownerHabitId, TODAY, TZ, NOW);

    const ownerLedger = await getHabitLedgerRows(owner.id);
    expect(ownerLedger).toHaveLength(1);
    expect(ownerLedger[0]?.userId).toBe(owner.id);
    expect(await getHabitLedgerRows(intruder.id)).toHaveLength(0);
  });

  it("cannot be raised by editing someone else's reward", async () => {
    await expect(updateHabit(intruder.id, ownerHabitId, EDIT)).rejects.toBeInstanceOf(NotFoundError);
    await completeHabit(owner.id, ownerHabitId, TODAY, TZ, NOW);

    // Still the stored 25, not the 999 the intruder tried to write.
    expect((await getStats(owner.id)).totalXp).toBe(25);
  });
});

/**
 * A Server Action's arguments are JSON the client chose. TypeScript's
 * `habitId: string` is erased at runtime, so nothing but an explicit check
 * stops an object arriving where an id is expected — and Prisma reads an
 * object as a *filter*, where `{ gt: "" }` matches every row in the table.
 *
 * These cases send exactly that, straight into the service, and assert that
 * another user's data is untouched.
 */
describe("an id that is not an id", () => {
  const FILTER = { gt: "" } as unknown as string;

  it("cannot be used to delete someone else's completion", async () => {
    await completeHabit(owner.id, ownerHabitId, TODAY, TZ, NOW);
    // The intruder owns an active habit, so an ownership probe that matches
    // "any habit of mine" would succeed and authorise the rest of the call.
    await createTestHabit(intruder.id, { name: "Decoy" });

    await undoHabitCompletion(intruder.id, FILTER, TODAY, NOW).catch(() => undefined);

    expect(await listHabitCompletionDates(ownerHabitId)).toEqual([TODAY]);
    expect((await getStats(owner.id)).totalXp).toBe(25);
    // And the intruder minted no reversal against their own ledger either.
    expect(await getHabitLedgerRows(intruder.id)).toHaveLength(0);
  });

  it("cannot be used to close someone else's pause", async () => {
    await setHabitStatus(owner.id, ownerHabitId, "PAUSED", "2026-09-21", NOW);
    const decoy = await createTestHabit(intruder.id, { name: "Decoy" });
    await setHabitStatus(intruder.id, decoy.id, "PAUSED", "2026-09-21", NOW);

    await setHabitStatus(intruder.id, FILTER, "ACTIVE", TODAY, NOW).catch(() => undefined);

    const stored = await getHabit(ownerHabitId);
    expect(stored.status).toBe("PAUSED");
    expect(stored.pauses).toHaveLength(1);
    // Still open: a closed pause would turn every paused day into a missed one.
    expect(stored.pauses[0]?.endDate).toBeNull();
  });

  it("cannot be used to record a completion on someone else's habit", async () => {
    await createTestHabit(intruder.id, { name: "Decoy" });

    await completeHabit(intruder.id, FILTER, TODAY, TZ, NOW).catch(() => undefined);

    expect(await listHabitCompletionDates(ownerHabitId)).toEqual([]);
  });

  it("is refused by the action layer before it reaches the database", async () => {
    const result = await setHabitCompletionAction(FILTER, TODAY, false);
    expect(result.status).toBe("error");
    // The same sentence a missing habit gets, so ids stay unenumerable.
    expect(result.errors?._form).toBe("That habit could not be found.");

    const status = await setHabitStatusAction(FILTER, "ARCHIVED");
    expect(status.status).toBe("error");
    expect(status.errors?._form).toBe("That habit could not be found.");
  });
});

describe("deleting a user", () => {
  it("takes their habits and history with them and leaves the other user whole", async () => {
    await completeHabit(owner.id, ownerHabitId, TODAY, TZ, NOW);
    const intruderHabit = await createTestHabit(intruder.id, { name: "Survivor" });
    await completeHabit(intruder.id, intruderHabit.id, TODAY, TZ, NOW);

    await db.user.delete({ where: { id: owner.id } });

    expect(await db.habit.count()).toBe(1);
    expect(await db.habitCompletion.count()).toBe(1);
    expect(await getHabits(intruder.id, TZ, { status: "ALL", search: null }, NOW)).toHaveLength(1);
    expect((await getStats(intruder.id)).totalXp).toBe(10);
  });
});
