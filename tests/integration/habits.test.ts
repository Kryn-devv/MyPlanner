import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { getHabitDetail, getHabitStatusCounts, getHabits, getHabitsForDay } from "@/lib/habits/queries";
import {
  HabitCompletionError,
  HabitStateError,
  completeHabit,
  createHabit,
  setHabitStatus,
  undoHabitCompletion,
  updateHabit,
} from "@/lib/habits/service";
import {
  createTestHabit,
  createTestHabitCompletion,
  createTestHabitPause,
  createTestTask,
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
import { completeTask } from "@/lib/tasks/service";

/**
 * Habits against a real database.
 *
 * The guarantees under test live in PostgreSQL — the unique key that makes one
 * completion per habit per day, the transaction that ties an award to the row
 * that earned it, the cascade that removes a habit's history with it — so a
 * mocked client would assert none of them.
 *
 * The week of 2026-09-21 is a Monday-to-Sunday week, which is what the date
 * layer treats a week as. Every clock here is explicit: no test reads `now()`.
 */
const TODAY = "2026-09-23"; // Wednesday
const NOW = new Date("2026-09-23T12:00:00.000Z");
const TZ = "UTC";

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Creating and editing
// ---------------------------------------------------------------------------

describe("creating a habit", () => {
  const input = {
    name: "Read",
    description: "Twenty pages.",
    frequency: "DAILY" as const,
    weekdays: [] as number[],
    weeklyTarget: null,
    xpReward: 15,
    startDate: "2026-09-01",
    endDate: null,
  };

  it("stores the schedule as calendar days and starts with no history", async () => {
    const { id } = await createHabit(user.id, input);

    const stored = await getHabit(id);
    expect(stored.name).toBe("Read");
    expect(stored.status).toBe("ACTIVE");
    expect(stored.xpReward).toBe(15);
    expect(stored.startDate.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(stored.endDate).toBeNull();
    expect(stored.pauses).toHaveLength(0);
    expect(await listHabitCompletionDates(id)).toEqual([]);
  });

  it("does not generate any tasks or calendar items", async () => {
    await createHabit(user.id, input);

    expect(await db.task.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.habitCompletion.count()).toBe(0);
  });

  it("awards no XP by existing", async () => {
    await createHabit(user.id, input);

    expect((await getStats(user.id)).totalXp).toBe(0);
    expect(await getHabitLedgerRows(user.id)).toHaveLength(0);
  });
});

describe("editing a habit", () => {
  it("changes what is due from here on and keeps every past completion", async () => {
    const habit = await createTestHabit(user.id, { frequency: "DAILY", startDate: "2026-09-01" });
    await createTestHabitCompletion(habit.id, "2026-09-22"); // a Tuesday

    // Mondays and Wednesdays only, from now on.
    await updateHabit(user.id, habit.id, {
      name: habit.name,
      description: null,
      frequency: "WEEKDAYS",
      weekdays: [1, 3],
      weeklyTarget: null,
      xpReward: habit.xpReward,
      startDate: "2026-09-01",
      endDate: null,
    });

    // The Tuesday is a historical fact and survives the schedule change.
    expect(await listHabitCompletionDates(habit.id)).toEqual(["2026-09-22"]);

    const detail = await getHabitDetail(user.id, habit.id, TZ, NOW);
    expect(detail?.frequency).toBe("WEEKDAYS");
    expect(detail?.completionCount).toBe(1);
  });

  it("does not re-award or reverse XP when the reward changes", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 10 });
    await completeHabit(user.id, habit.id, "2026-09-22", TZ, NOW);

    await updateHabit(user.id, habit.id, {
      name: habit.name,
      description: null,
      frequency: "DAILY",
      weekdays: [],
      weeklyTarget: null,
      xpReward: 500,
      startDate: "2026-09-01",
      endDate: null,
    });

    expect((await getStats(user.id)).totalXp).toBe(10);
    expect(await getLedgerTotal(user.id)).toBe(10);
  });

  it("refuses an id belonging to nobody", async () => {
    await expect(
      updateHabit(user.id, "clfictional0000000000000", {
        name: "X",
        description: null,
        frequency: "DAILY",
        weekdays: [],
        weeklyTarget: null,
        xpReward: 10,
        startDate: "2026-09-01",
        endDate: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

describe("completing an occurrence", () => {
  it("records the day and awards the habit's XP once", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });

    const outcome = await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(25);
    expect(outcome.totalXp).toBe(25);
    expect(await listHabitCompletionDates(habit.id)).toEqual([TODAY]);

    const ledger = await getHabitLedgerRows(user.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: 25, kind: "AWARD", source: "HABIT_COMPLETION" });
    expect(ledger[0]?.habitCompletionId).not.toBeNull();
    expect(ledger[0]?.taskId).toBeNull();
  });

  it("keeps the cached total equal to the ledger sum", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);
    await completeHabit(user.id, habit.id, "2026-09-22", TZ, NOW);

    expect((await getStats(user.id)).totalXp).toBe(await getLedgerTotal(user.id));
  });

  it("is idempotent: a second tick of the same day changes and awards nothing", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    const second = await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    expect(second.changed).toBe(false);
    expect(second.xpDelta).toBe(0);
    expect(second.totalXp).toBe(25);
    expect(await listHabitCompletionDates(habit.id)).toEqual([TODAY]);
    expect(await getHabitLedgerRows(user.id)).toHaveLength(1);
  });

  it("reads the reward from the stored row, not from the caller", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 7 });
    const outcome = await completeHabit(user.id, habit.id, TODAY, TZ, NOW);
    expect(outcome.xpDelta).toBe(7);
  });

  it("awards nothing, but still records the day, for a zero-XP habit", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 0 });

    const outcome = await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(0);
    expect(await listHabitCompletionDates(habit.id)).toEqual([TODAY]);
    expect(await getHabitLedgerRows(user.id)).toHaveLength(0);
  });

  it("accepts a back-dated day inside the window", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-01-01" });

    await completeHabit(user.id, habit.id, "2026-09-20", TZ, NOW);

    expect(await listHabitCompletionDates(habit.id)).toEqual(["2026-09-20"]);
  });

  it("refuses a day in the future", async () => {
    const habit = await createTestHabit(user.id);
    const error = await completeHabit(user.id, habit.id, "2026-09-24", TZ, NOW).catch((e) => e);
    expect(error).toBeInstanceOf(HabitCompletionError);
    expect((error as HabitCompletionError).reason).toBe("future");
  });

  it("refuses a day the habit was not due", async () => {
    // Mondays and Wednesdays; 2026-09-22 is a Tuesday.
    const habit = await createTestHabit(user.id, { frequency: "WEEKDAYS", weekdays: [1, 3] });
    const error = await completeHabit(user.id, habit.id, "2026-09-22", TZ, NOW).catch((e) => e);
    expect(error).toBeInstanceOf(HabitCompletionError);
    expect((error as HabitCompletionError).reason).toBe("not-scheduled");
  });

  it("refuses a day before the habit began", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-22" });
    const error = await completeHabit(user.id, habit.id, "2026-09-21", TZ, NOW).catch((e) => e);
    expect((error as HabitCompletionError).reason).toBe("not-scheduled");
  });

  it("refuses a day beyond the history window", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2020-01-01" });
    const error = await completeHabit(user.id, habit.id, "2024-01-01", TZ, NOW).catch((e) => e);
    expect((error as HabitCompletionError).reason).toBe("too-old");
  });

  it("refuses while the habit is paused or archived", async () => {
    const paused = await createTestHabit(user.id, { status: "PAUSED", name: "Paused" });
    const archived = await createTestHabit(user.id, { status: "ARCHIVED", name: "Archived" });

    for (const id of [paused.id, archived.id]) {
      const error = await completeHabit(user.id, id, TODAY, TZ, NOW).catch((e) => e);
      expect((error as HabitCompletionError).reason).toBe("not-active");
    }
    expect(await db.habitCompletion.count()).toBe(0);
  });
});

describe("the global task streak", () => {
  it("is untouched by completing a habit", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 30 });

    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    const stats = await getStats(user.id);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.lastCompletedDate).toBeNull();
    expect(stats.tasksCompleted).toBe(0);
    // But the XP economy is shared.
    expect(stats.totalXp).toBe(30);
  });

  it("is not disturbed when a habit is completed after a task", async () => {
    const task = await createTestTask(user.id, { xpReward: 20 });
    await completeTask(user.id, task.id, TZ, NOW);
    const habit = await createTestHabit(user.id, { xpReward: 30 });

    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    const stats = await getStats(user.id);
    expect(stats.currentStreak).toBe(1);
    expect(stats.tasksCompleted).toBe(1);
    expect(stats.totalXp).toBe(50);
    expect(await getLedgerTotal(user.id)).toBe(50);
  });
});

describe("undoing a completion", () => {
  it("removes the day and reverses exactly the XP awarded", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    const outcome = await undoHabitCompletion(user.id, habit.id, TODAY, NOW);

    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(-25);
    expect(outcome.totalXp).toBe(0);
    expect(await listHabitCompletionDates(habit.id)).toEqual([]);

    // The ledger keeps both rows and nets to zero — history is append-only.
    const ledger = await getHabitLedgerRows(user.id);
    expect(ledger.map((row) => row.kind)).toEqual(["AWARD", "REVERSAL"]);
    expect(await getLedgerTotal(user.id)).toBe(0);
    expect((await getStats(user.id)).totalXp).toBe(0);
  });

  it("reverses what was given, not what the habit is worth now", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 10 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);
    await db.habit.update({ where: { id: habit.id }, data: { xpReward: 900 } });

    const outcome = await undoHabitCompletion(user.id, habit.id, TODAY, NOW);

    expect(outcome.xpDelta).toBe(-10);
    expect((await getStats(user.id)).totalXp).toBe(0);
  });

  it("is a no-op for a day that was never completed", async () => {
    const habit = await createTestHabit(user.id);

    const outcome = await undoHabitCompletion(user.id, habit.id, TODAY, NOW);

    expect(outcome.changed).toBe(false);
    expect(outcome.xpDelta).toBe(0);
    expect(await getHabitLedgerRows(user.id)).toHaveLength(0);
  });

  it("can be re-completed afterwards, awarding again", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);
    await undoHabitCompletion(user.id, habit.id, TODAY, NOW);

    const again = await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    expect(again.changed).toBe(true);
    expect(again.xpDelta).toBe(25);
    expect((await getStats(user.id)).totalXp).toBe(25);
    expect(await getLedgerTotal(user.id)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe("pausing and resuming", () => {
  it("opens a pause from today and closes it at yesterday on resume", async () => {
    const habit = await createTestHabit(user.id);

    await setHabitStatus(user.id, habit.id, "PAUSED", "2026-09-21", NOW);
    let stored = await getHabit(habit.id);
    expect(stored.status).toBe("PAUSED");
    expect(stored.pauses).toHaveLength(1);
    expect(stored.pauses[0]?.startDate.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(stored.pauses[0]?.endDate).toBeNull();

    await setHabitStatus(user.id, habit.id, "ACTIVE", TODAY, NOW);
    stored = await getHabit(habit.id);
    expect(stored.status).toBe("ACTIVE");
    expect(stored.pauses[0]?.endDate?.toISOString().slice(0, 10)).toBe("2026-09-22");
  });

  it("leaves no empty interval when paused and resumed the same day", async () => {
    const habit = await createTestHabit(user.id);

    await setHabitStatus(user.id, habit.id, "PAUSED", TODAY, NOW);
    await setHabitStatus(user.id, habit.id, "ACTIVE", TODAY, NOW);

    expect((await getHabit(habit.id)).pauses).toHaveLength(0);
  });

  it("does not count paused days as misses", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-01" });
    // Kept through the 18th, then paused for three days, then kept again.
    for (const day of ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-22", TODAY]) {
      await createTestHabitCompletion(habit.id, day);
    }
    await createTestHabitPause(habit.id, "2026-09-19", "2026-09-21");

    const detail = await getHabitDetail(user.id, habit.id, TZ, NOW);

    // The pause is stepped over: five completions, one unbroken run.
    expect(detail?.streaks.current).toBe(5);
  });

  it("keeps the pause open when a paused habit is archived", async () => {
    const habit = await createTestHabit(user.id);
    await setHabitStatus(user.id, habit.id, "PAUSED", "2026-09-21", NOW);

    await setHabitStatus(user.id, habit.id, "ARCHIVED", TODAY, NOW);

    const stored = await getHabit(habit.id);
    expect(stored.status).toBe("ARCHIVED");
    expect(stored.pauses).toHaveLength(1);
    expect(stored.pauses[0]?.endDate).toBeNull();
  });
});

describe("archiving", () => {
  it("stamps archivedAt and stops the habit being due", async () => {
    const habit = await createTestHabit(user.id);

    await setHabitStatus(user.id, habit.id, "ARCHIVED", TODAY, NOW);

    const stored = await getHabit(habit.id);
    expect(stored.status).toBe("ARCHIVED");
    expect(stored.archivedAt).toBeInstanceOf(Date);
    expect(await getHabitsForDay(user.id, TODAY, TODAY)).toHaveLength(0);
  });

  it("keeps the history, and restoring clears archivedAt", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 10 });
    await completeHabit(user.id, habit.id, "2026-09-22", TZ, NOW);
    await setHabitStatus(user.id, habit.id, "ARCHIVED", TODAY, NOW);

    expect(await listHabitCompletionDates(habit.id)).toEqual(["2026-09-22"]);
    expect((await getStats(user.id)).totalXp).toBe(10);

    await setHabitStatus(user.id, habit.id, "ACTIVE", TODAY, NOW);
    const stored = await getHabit(habit.id);
    expect(stored.status).toBe("ACTIVE");
    expect(stored.archivedAt).toBeNull();
  });

  it("refuses to move straight from archived to paused", async () => {
    const habit = await createTestHabit(user.id, { status: "ARCHIVED" });

    await expect(setHabitStatus(user.id, habit.id, "PAUSED", TODAY, NOW)).rejects.toBeInstanceOf(
      HabitStateError,
    );
  });

  it("reports no change when the habit is already in that state", async () => {
    const habit = await createTestHabit(user.id);
    const result = await setHabitStatus(user.id, habit.id, "ACTIVE", TODAY, NOW);
    expect(result.changed).toBe(false);
    expect((await getHabit(habit.id)).pauses).toHaveLength(0);
  });
});

describe("deleting a habit", () => {
  it("takes its completions with it and detaches, not deletes, the ledger", async () => {
    const habit = await createTestHabit(user.id, { xpReward: 25 });
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    await db.habit.delete({ where: { id: habit.id } });

    expect(await db.habitCompletion.count()).toBe(0);
    const ledger = await getHabitLedgerRows(user.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.habitCompletionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe("the habit list", () => {
  it("puts what is still due first, then what is done, then what is not due", async () => {
    const due = await createTestHabit(user.id, { name: "Due" });
    const done = await createTestHabit(user.id, { name: "Done" });
    // Mondays only: not due on a Wednesday.
    await createTestHabit(user.id, { name: "Not due", frequency: "WEEKDAYS", weekdays: [1] });
    await completeHabit(user.id, done.id, TODAY, TZ, NOW);

    const habits = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);

    expect(habits.map((h) => h.name)).toEqual(["Due", "Done", "Not due"]);
    expect(habits[0]?.id).toBe(due.id);
    expect(habits[1]?.completed).toBe(true);
  });

  it("filters by status and searches by name", async () => {
    await createTestHabit(user.id, { name: "Morning run" });
    await createTestHabit(user.id, { name: "Evening read", status: "PAUSED" });
    await createTestHabit(user.id, { name: "Old thing", status: "ARCHIVED" });

    const active = await getHabits(user.id, TZ, { status: "ACTIVE", search: null }, NOW);
    expect(active.map((h) => h.name)).toEqual(["Morning run"]);

    const searched = await getHabits(user.id, TZ, { status: "ALL", search: "read" }, NOW);
    expect(searched.map((h) => h.name)).toEqual(["Evening read"]);

    expect(await getHabitStatusCounts(user.id)).toEqual({
      ACTIVE: 1,
      PAUSED: 1,
      ARCHIVED: 1,
      ALL: 3,
    });
  });

  it("derives the streak from the completion rows, with today still open", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-01" });
    for (const day of ["2026-09-20", "2026-09-21", "2026-09-22"]) {
      await createTestHabitCompletion(habit.id, day);
    }

    const [view] = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);

    // Today is untouched and is not a miss, so the run of three stands.
    expect(view?.streaks.current).toBe(3);
    expect(view?.streaks.longest).toBe(3);
    expect(view?.completed).toBe(false);

    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);
    const [after] = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);
    expect(after?.streaks.current).toBe(4);
  });

  it("reports a month's completion rate over what was actually due", async () => {
    // Mondays and Wednesdays, starting the Monday two weeks back.
    const habit = await createTestHabit(user.id, {
      frequency: "WEEKDAYS",
      weekdays: [1, 3],
      startDate: "2026-09-14",
    });
    for (const day of ["2026-09-14", "2026-09-16", "2026-09-21"]) {
      await createTestHabitCompletion(habit.id, day);
    }

    const [view] = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);

    // Due: 14th, 16th, 21st and today — today is still open, so three count.
    expect(view?.rate30).toMatchObject({ scheduled: 3, completed: 3, percent: 100 });
  });
});

describe("a day's habits", () => {
  it("returns what is due that day and what was completed on it", async () => {
    const daily = await createTestHabit(user.id, { name: "Daily", startDate: "2026-09-01" });
    // Mondays only.
    const mondays = await createTestHabit(user.id, {
      name: "Mondays",
      frequency: "WEEKDAYS",
      weekdays: [1],
      startDate: "2026-09-01",
    });

    const monday = await getHabitsForDay(user.id, "2026-09-21", TODAY);
    expect(monday.map((h) => h.name)).toEqual(["Daily", "Mondays"]);

    const wednesday = await getHabitsForDay(user.id, TODAY, TODAY);
    expect(wednesday.map((h) => h.name)).toEqual(["Daily"]);
    expect(wednesday[0]?.id).toBe(daily.id);
    expect(mondays.id).toBeTruthy();
  });

  it("includes a paused habit on the days before its pause began", async () => {
    const habit = await createTestHabit(user.id, { status: "PAUSED", startDate: "2026-09-01" });
    await createTestHabitPause(habit.id, "2026-09-22", null);

    expect(await getHabitsForDay(user.id, "2026-09-21", TODAY)).toHaveLength(1);
    expect(await getHabitsForDay(user.id, TODAY, TODAY)).toHaveLength(0);
  });

  it("still shows a habit completed on a day it is no longer due", async () => {
    // Mondays only, but a Wednesday was ticked before the schedule changed.
    const habit = await createTestHabit(user.id, {
      frequency: "WEEKDAYS",
      weekdays: [1],
      startDate: "2026-09-01",
    });
    await createTestHabitCompletion(habit.id, TODAY);

    const day = await getHabitsForDay(user.id, TODAY, TODAY);
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ due: false, completed: true });
  });
});

describe("the habit detail", () => {
  it("returns a grid, recent completions and the lifetime count", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-01" });
    for (const day of ["2026-09-20", "2026-09-21", "2026-09-22"]) {
      await createTestHabitCompletion(habit.id, day);
    }

    const detail = await getHabitDetail(user.id, habit.id, TZ, NOW);

    expect(detail?.completionCount).toBe(3);
    expect(detail?.recent.map((r) => r.date)).toEqual([
      "2026-09-22",
      "2026-09-21",
      "2026-09-20",
    ]);
    // Twelve whole weeks ending with the week containing today.
    expect(detail?.history).toHaveLength(12);
    expect(detail?.history.at(-1)?.start).toBe("2026-09-21");

    const week = detail?.history.at(-1);
    expect(week?.days.map((d) => d.state)).toEqual([
      "completed", // Mon 21st
      "completed", // Tue 22nd
      "due", // Wed 23rd — today, still open
      "due",
      "due",
      "due",
      "due",
    ]);
  });

  it("marks days before the start and inside a pause distinctly from misses", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-22" });
    await createTestHabitPause(habit.id, "2026-09-22", "2026-09-22");

    const detail = await getHabitDetail(user.id, habit.id, TZ, NOW);
    const week = detail?.history.at(-1);

    expect(week?.days[0]?.state).toBe("before-start"); // Mon 21st
    expect(week?.days[1]?.state).toBe("paused"); // Tue 22nd
  });

  it("returns null for a habit that does not exist", async () => {
    expect(await getHabitDetail(user.id, "clfictional0000000000000", TZ, NOW)).toBeNull();
  });
});

describe("a weekly habit", () => {
  it("counts kept weeks, not days, and leaves the current week open", async () => {
    const habit = await createTestHabit(user.id, {
      frequency: "WEEKLY",
      weeklyTarget: 3,
      startDate: "2026-09-07",
    });
    // Week of the 7th: three — kept. Week of the 14th: three — kept.
    for (const day of [
      "2026-09-07",
      "2026-09-09",
      "2026-09-11",
      "2026-09-14",
      "2026-09-16",
      "2026-09-18",
      "2026-09-21", // this week: one of three so far
    ]) {
      await createTestHabitCompletion(habit.id, day);
    }

    const [view] = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);

    expect(view?.weekly).toEqual({ done: 1, target: 3 });
    // The current week is neutral until it is over.
    expect(view?.streaks.current).toBe(2);
  });

  it("can be completed on any available day of the week", async () => {
    const habit = await createTestHabit(user.id, {
      frequency: "WEEKLY",
      weeklyTarget: 2,
      startDate: "2026-09-01",
    });

    await completeHabit(user.id, habit.id, "2026-09-22", TZ, NOW);
    await completeHabit(user.id, habit.id, TODAY, TZ, NOW);

    const [view] = await getHabits(user.id, TZ, { status: "ALL", search: null }, NOW);
    expect(view?.weekly).toEqual({ done: 2, target: 2 });
  });
});

describe("timezones", () => {
  it("decides the day by the user's calendar, not the server's", async () => {
    const habit = await createTestHabit(user.id, { startDate: "2026-09-01" });
    // 05:00 UTC on the 23rd is still 19:00 on the 22nd in Honolulu (UTC-10).
    const earlyMorning = new Date("2026-09-23T05:00:00.000Z");
    const error = await completeHabit(
      user.id,
      habit.id,
      TODAY,
      "Pacific/Honolulu",
      earlyMorning,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(HabitCompletionError);
    expect((error as HabitCompletionError).reason).toBe("future");

    // And the day it *is* there is accepted.
    const outcome = await completeHabit(
      user.id,
      habit.id,
      "2026-09-22",
      "Pacific/Honolulu",
      earlyMorning,
    );
    expect(outcome.changed).toBe(true);
  });
});
