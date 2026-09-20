import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { calculateLevel } from "@/lib/leveling";
import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  setTaskCompletion,
  updateTask,
} from "@/lib/tasks/service";
import {
  createTestTask,
  createTestUser,
  db,
  getLedgerRows,
  getLedgerTotal,
  getStats,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * These run against a real PostgreSQL database on purpose. The guarantees
 * being asserted — a unique index that makes double-awarding impossible, a
 * compare-and-swap that settles concurrent clicks, transactional rollback —
 * live in the database, and a mocked client would assert none of them.
 */

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("completing a task", () => {
  it("marks it complete, stamps completedAt and awards its XP", async () => {
    const task = await createTestTask(user.id, { xpReward: 40, priority: "HIGH" });

    const outcome = await completeTask(user.id, task.id, user.timezone);

    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(40);
    expect(outcome.totalXp).toBe(40);

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.completed).toBe(true);
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect(stored.completionCount).toBe(1);

    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(40);
    expect(stats.tasksCompleted).toBe(1);
  });

  it("writes exactly one AWARD ledger row", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);

    const rows = await getLedgerRows(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 40, kind: "AWARD", cycle: 1, source: "TASK_COMPLETION" });
  });

  it("takes the reward from the stored row, never from the caller", async () => {
    // The service signature has no XP parameter at all — the only way to
    // influence the award is to change the persisted task.
    const task = await createTestTask(user.id, { xpReward: 15 });
    const outcome = await completeTask(user.id, task.id, user.timezone);
    expect(outcome.xpDelta).toBe(15);
  });

  it("recalculates the level as XP accumulates", async () => {
    // Level 2 is at 100 XP, level 3 at 300.
    for (let i = 0; i < 3; i++) {
      const task = await createTestTask(user.id, { xpReward: 60 });
      await completeTask(user.id, task.id, user.timezone);
    }
    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(180);
    expect(stats.level).toBe(calculateLevel(180));
    expect(stats.level).toBe(2);
  });

  it("reports a level-up the moment a threshold is crossed", async () => {
    const first = await createTestTask(user.id, { xpReward: 90 });
    const second = await createTestTask(user.id, { xpReward: 20 });

    const before = await completeTask(user.id, first.id, user.timezone);
    expect(before.leveledUp).toBe(false);

    const after = await completeTask(user.id, second.id, user.timezone);
    expect(after.leveledUp).toBe(true);
    expect(after.previousLevel).toBe(1);
    expect(after.level).toBe(2);
  });

  it("awards nothing for a zero-XP task but still completes it", async () => {
    const task = await createTestTask(user.id, { xpReward: 0 });
    const outcome = await completeTask(user.id, task.id, user.timezone);

    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(0);
    expect(await getLedgerTotal(user.id)).toBe(0);
    expect((await getStats(user.id)).tasksCompleted).toBe(1);
  });
});

describe("duplicate XP prevention", () => {
  it("awards nothing when the same task is completed twice", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });

    const first = await completeTask(user.id, task.id, user.timezone);
    const second = await completeTask(user.id, task.id, user.timezone);

    expect(first.xpDelta).toBe(40);
    expect(second.changed).toBe(false);
    expect(second.xpDelta).toBe(0);

    expect(await getLedgerTotal(user.id)).toBe(40);
    expect((await getStats(user.id)).totalXp).toBe(40);
    expect(await getLedgerRows(task.id)).toHaveLength(1);
  });

  it("survives an impatient user clicking complete ten times in a row", async () => {
    const task = await createTestTask(user.id, { xpReward: 60 });

    for (let i = 0; i < 10; i++) {
      await completeTask(user.id, task.id, user.timezone);
    }

    expect((await getStats(user.id)).totalXp).toBe(60);
    expect(await getLedgerRows(task.id)).toHaveLength(1);
  });

  it("awards once when ten requests race concurrently", async () => {
    // The real double-click case: parallel requests, no ordering guarantee.
    // Only the compare-and-swap in the UPDATE can settle this correctly.
    const task = await createTestTask(user.id, { xpReward: 60 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => completeTask(user.id, task.id, user.timezone)),
    );

    const awarded = results.filter(
      (r) => r.status === "fulfilled" && r.value.xpDelta > 0,
    );
    expect(awarded).toHaveLength(1);

    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(60);
    expect(stats.tasksCompleted).toBe(1);
    expect(await getLedgerRows(task.id)).toHaveLength(1);
  });

  it("nets to zero over a complete/reopen/complete cycle", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });

    await completeTask(user.id, task.id, user.timezone);
    expect((await getStats(user.id)).totalXp).toBe(40);

    await reopenTask(user.id, task.id);
    expect((await getStats(user.id)).totalXp).toBe(0);

    await completeTask(user.id, task.id, user.timezone);
    expect((await getStats(user.id)).totalXp).toBe(40);
  });

  it("cannot be farmed by toggling repeatedly", async () => {
    const task = await createTestTask(user.id, { xpReward: 60 });

    for (let i = 0; i < 20; i++) {
      await completeTask(user.id, task.id, user.timezone);
      await reopenTask(user.id, task.id);
    }
    await completeTask(user.id, task.id, user.timezone);

    // 20 full cycles plus one final completion: the reward, exactly once.
    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(60);
    expect(await getLedgerTotal(user.id)).toBe(60);
  });

  it("reverses what was actually granted, not the task's current reward", async () => {
    // Raising the reward after completing must not let the user withdraw more
    // XP than the ledger ever granted.
    const task = await createTestTask(user.id, { xpReward: 10 });
    await completeTask(user.id, task.id, user.timezone);

    await db.task.update({ where: { id: task.id }, data: { xpReward: 900 } });
    await reopenTask(user.id, task.id);

    expect((await getStats(user.id)).totalXp).toBe(0);
    expect(await getLedgerTotal(user.id)).toBe(0);
  });

  it("keeps the cached total equal to the ledger sum throughout", async () => {
    const tasks = await Promise.all([
      createTestTask(user.id, { xpReward: 10 }),
      createTestTask(user.id, { xpReward: 40 }),
      createTestTask(user.id, { xpReward: 60 }),
    ]);

    for (const task of tasks) await completeTask(user.id, task.id, user.timezone);
    await reopenTask(user.id, tasks[1]!.id);
    await completeTask(user.id, tasks[1]!.id, user.timezone);
    await reopenTask(user.id, tasks[2]!.id);

    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(await getLedgerTotal(user.id));
    expect(stats.totalXp).toBe(50);
    expect(stats.level).toBe(calculateLevel(stats.totalXp));
  });

  it("never drives the total negative", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);
    await reopenTask(user.id, task.id);
    await reopenTask(user.id, task.id);

    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(0);
    expect(stats.level).toBe(1);
  });
});

describe("reopening a task", () => {
  it("clears completion state and reverses the XP", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);

    const outcome = await reopenTask(user.id, task.id);
    expect(outcome.changed).toBe(true);
    expect(outcome.xpDelta).toBe(-40);

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.completed).toBe(false);
    expect(stored.completedAt).toBeNull();
  });

  it("records the reversal rather than deleting history", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);
    await reopenTask(user.id, task.id);

    const rows = await getLedgerRows(task.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind)).toEqual(["AWARD", "REVERSAL"]);
    expect(rows.map((r) => r.amount)).toEqual([40, -40]);
  });

  it("uses a fresh cycle for each completion so rows never collide", async () => {
    const task = await createTestTask(user.id, { xpReward: 10 });
    await completeTask(user.id, task.id, user.timezone);
    await reopenTask(user.id, task.id);
    await completeTask(user.id, task.id, user.timezone);

    const rows = await getLedgerRows(task.id);
    expect(rows.map((r) => `${r.kind}:${r.cycle}`)).toEqual([
      "AWARD:1",
      "REVERSAL:1",
      "AWARD:2",
    ]);
  });

  it("is a no-op on a task that is already open", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    const outcome = await reopenTask(user.id, task.id);

    expect(outcome.changed).toBe(false);
    expect(outcome.xpDelta).toBe(0);
    expect(await getLedgerRows(task.id)).toHaveLength(0);
  });

  it("does not erase a streak that was genuinely earned", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);
    const before = await getStats(user.id);

    await reopenTask(user.id, task.id);
    const after = await getStats(user.id);

    expect(after.currentStreak).toBe(before.currentStreak);
    expect(after.lastCompletedDate).toBe(before.lastCompletedDate);
  });

  it("decrements the completed-task counter without going below zero", async () => {
    const task = await createTestTask(user.id);
    await completeTask(user.id, task.id, user.timezone);
    await reopenTask(user.id, task.id);
    await reopenTask(user.id, task.id);

    expect((await getStats(user.id)).tasksCompleted).toBe(0);
  });
});

describe("setTaskCompletion", () => {
  it("routes to complete and reopen from a single toggle", async () => {
    const task = await createTestTask(user.id, { xpReward: 20 });

    await setTaskCompletion(user.id, task.id, true, user.timezone);
    expect((await getStats(user.id)).totalXp).toBe(20);

    await setTaskCompletion(user.id, task.id, false, user.timezone);
    expect((await getStats(user.id)).totalXp).toBe(0);
  });
});

describe("deleting a task", () => {
  it("removes the task and its ledger rows together", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);

    await deleteTask(user.id, task.id);

    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await getLedgerRows(task.id)).toHaveLength(0);
  });

  it("keeps the cached total in step with the ledger after a delete", async () => {
    const keep = await createTestTask(user.id, { xpReward: 10 });
    const remove = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, keep.id, user.timezone);
    await completeTask(user.id, remove.id, user.timezone);
    expect((await getStats(user.id)).totalXp).toBe(50);

    await deleteTask(user.id, remove.id);

    const stats = await getStats(user.id);
    expect(stats.totalXp).toBe(10);
    expect(stats.totalXp).toBe(await getLedgerTotal(user.id));
    expect(stats.tasksCompleted).toBe(1);
  });

  it("leaves XP untouched when deleting an unfinished task", async () => {
    const done = await createTestTask(user.id, { xpReward: 40 });
    const open = await createTestTask(user.id, { xpReward: 60 });
    await completeTask(user.id, done.id, user.timezone);

    await deleteTask(user.id, open.id);
    expect((await getStats(user.id)).totalXp).toBe(40);
  });
});

describe("create and update", () => {
  it("persists every field of a task", async () => {
    const created = await createTask(user.id, {
      title: "Work on IRIS",
      description: "Ingestion pipeline",
      priority: "URGENT",
      categoryId: user.categoryIds[0] ?? null,
      dueDate: "2026-09-21",
      dueTime: "17:30",
      estimatedMinutes: 90,
      xpReward: 60,
    });

    const stored = await db.task.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({
      title: "Work on IRIS",
      description: "Ingestion pipeline",
      priority: "URGENT",
      dueTime: "17:30",
      estimatedMinutes: 90,
      xpReward: 60,
      completed: false,
      completionCount: 0,
    });
    expect(stored.dueDate?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("updates fields without disturbing XP already awarded", async () => {
    const task = await createTestTask(user.id, { xpReward: 40 });
    await completeTask(user.id, task.id, user.timezone);

    await updateTask(user.id, task.id, {
      title: "Renamed",
      description: null,
      priority: "LOW",
      categoryId: null,
      dueDate: null,
      dueTime: null,
      estimatedMinutes: null,
      xpReward: 10,
    });

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe("Renamed");
    expect(stored.xpReward).toBe(10);
    // The award already in the ledger is history and must not be rewritten.
    expect((await getStats(user.id)).totalXp).toBe(40);
  });
});

describe("missing tasks", () => {
  it("reports an unknown id as not found", async () => {
    await expect(completeTask(user.id, "does-not-exist", user.timezone)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(reopenTask(user.id, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTask(user.id, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});
