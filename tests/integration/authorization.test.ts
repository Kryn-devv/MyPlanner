import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { getCategories, getDashboardData, getTaskById, getTasks } from "@/lib/tasks/queries";
import { completeTask, deleteTask, reopenTask, updateTask } from "@/lib/tasks/service";
import { validateTask } from "@/lib/validation/task";
import {
  createTestTask,
  createTestUser,
  db,
  getLedgerRows,
  getStats,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Cross-user isolation.
 *
 * The threat model is a signed-in user who knows (or guesses) another user's
 * task id and posts it. Every operation must behave as if that row does not
 * exist — both to protect the data and so task ids are not enumerable.
 */

let alice: TestUser;
let mallory: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await createTestUser();
  mallory = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

function taskInput(overrides: Partial<Record<string, string>> = {}) {
  const form = new FormData();
  form.append("title", "Injected");
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) form.append(key, value);
  }
  return form;
}

describe("reading another user's data", () => {
  it("does not return their tasks in a list", async () => {
    await createTestTask(alice.id, { title: "Alice private" });
    await createTestTask(mallory.id, { title: "Mallory own" });

    const tasks = await getTasks(mallory.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Mallory own");
  });

  it("returns null when fetching their task by id", async () => {
    const task = await createTestTask(alice.id, { title: "Alice private" });
    expect(await getTaskById(mallory.id, task.id)).toBeNull();
    // Sanity check: the row really does exist.
    expect(await getTaskById(alice.id, task.id)).not.toBeNull();
  });

  it("does not leak their tasks into the dashboard", async () => {
    await createTestTask(alice.id, { title: "Alice private", dueDate: new Date("2026-09-20T00:00:00Z") });

    const dashboard = await getDashboardData(mallory.id, "UTC", new Date("2026-09-20T12:00:00Z"));
    const everyTask = [
      ...dashboard.todayTasks,
      ...dashboard.overdueTasks,
      ...dashboard.upcomingTasks,
      ...dashboard.deadlines,
    ];
    expect(everyTask).toHaveLength(0);
    expect(dashboard.totalOpenTasks).toBe(0);
  });

  it("does not return their categories", async () => {
    const categories = await getCategories(mallory.id);
    expect(categories.every((c) => alice.categoryIds.includes(c.id) === false)).toBe(true);
  });

  it("scopes a text search to the caller", async () => {
    await createTestTask(alice.id, { title: "Secret roadmap" });
    const results = await getTasks(mallory.id, { search: "Secret" });
    expect(results).toHaveLength(0);
  });
});

describe("writing to another user's data", () => {
  it("refuses to complete their task and awards no XP", async () => {
    const task = await createTestTask(alice.id, { xpReward: 60 });

    await expect(completeTask(mallory.id, task.id, "UTC")).rejects.toBeInstanceOf(NotFoundError);

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.completed).toBe(false);
    expect(stored.completionCount).toBe(0);
    expect(await getLedgerRows(task.id)).toHaveLength(0);
    expect((await getStats(mallory.id)).totalXp).toBe(0);
    expect((await getStats(alice.id)).totalXp).toBe(0);
  });

  it("rolls back the compare-and-swap when ownership fails", async () => {
    // The UPDATE runs before the ownership check inside the transaction, so
    // this asserts the whole transaction actually rolls back.
    const task = await createTestTask(alice.id);
    await expect(completeTask(mallory.id, task.id, "UTC")).rejects.toThrow();

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.completed).toBe(false);
    expect(stored.completedAt).toBeNull();
    expect(stored.completionCount).toBe(0);
  });

  it("refuses to reopen their completed task", async () => {
    const task = await createTestTask(alice.id, { xpReward: 40 });
    await completeTask(alice.id, task.id, "UTC");

    await expect(reopenTask(mallory.id, task.id)).rejects.toBeInstanceOf(NotFoundError);

    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).completed).toBe(true);
    expect((await getStats(alice.id)).totalXp).toBe(40);
  });

  it("refuses to edit their task", async () => {
    const task = await createTestTask(alice.id, { title: "Original" });

    const parsed = validateTask(taskInput({ title: "Hijacked" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await expect(updateTask(mallory.id, task.id, parsed.data)).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe("Original");
  });

  it("refuses to delete their task", async () => {
    const task = await createTestTask(alice.id);

    await expect(deleteTask(mallory.id, task.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.task.findUnique({ where: { id: task.id } })).not.toBeNull();
  });

  it("rejects a task filed under someone else's category", async () => {
    const foreignCategoryId = alice.categoryIds[0];
    expect(foreignCategoryId).toBeDefined();

    const result = validateTask(taskInput({ categoryId: foreignCategoryId }), mallory.categoryIds);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.categoryId).toBeDefined();
  });

  it("reports a foreign task exactly like a non-existent one", async () => {
    // Identical errors mean a probe cannot distinguish "not yours" from
    // "not real", so task ids stay unenumerable.
    const foreign = await createTestTask(alice.id);

    const foreignError = await completeTask(mallory.id, foreign.id, "UTC").catch((e: Error) => e);
    const missingError = await completeTask(mallory.id, "no-such-id", "UTC").catch((e: Error) => e);

    expect(foreignError).toBeInstanceOf(NotFoundError);
    expect(missingError).toBeInstanceOf(NotFoundError);
    expect((foreignError as Error).message).toBe((missingError as Error).message);
  });
});

describe("account isolation of progression", () => {
  it("keeps XP, levels and streaks per user", async () => {
    const aliceTask = await createTestTask(alice.id, { xpReward: 60 });
    const malloryTask = await createTestTask(mallory.id, { xpReward: 10 });

    await completeTask(alice.id, aliceTask.id, "UTC");
    await completeTask(mallory.id, malloryTask.id, "UTC");

    expect((await getStats(alice.id)).totalXp).toBe(60);
    expect((await getStats(mallory.id)).totalXp).toBe(10);
  });

  it("removes everything belonging to a deleted account and nothing else", async () => {
    const aliceTask = await createTestTask(alice.id, { xpReward: 40 });
    const malloryTask = await createTestTask(mallory.id, { xpReward: 40 });
    await completeTask(alice.id, aliceTask.id, "UTC");
    await completeTask(mallory.id, malloryTask.id, "UTC");

    await db.user.delete({ where: { id: alice.id } });

    expect(await db.task.findUnique({ where: { id: aliceTask.id } })).toBeNull();
    expect(await db.xpTransaction.count({ where: { userId: alice.id } })).toBe(0);
    expect(await db.userStats.findUnique({ where: { userId: alice.id } })).toBeNull();
    expect(await db.category.count({ where: { userId: alice.id } })).toBe(0);

    // Mallory is untouched.
    expect(await db.task.findUnique({ where: { id: malloryTask.id } })).not.toBeNull();
    expect((await getStats(mallory.id)).totalXp).toBe(40);
  });
});
