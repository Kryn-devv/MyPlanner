import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { localDateToDbDate } from "@/lib/datetime";
import { getCalendarItems } from "@/lib/calendar/queries";
import { getViewRange } from "@/lib/calendar/range";
import {
  createTestGoal,
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * The calendar reads four tables at once, which makes it the widest read
 * surface in the app — and therefore the one most worth proving. Every case
 * here fills one user's calendar with another user's records and asserts that
 * none of them are reachable.
 *
 * Milestones get particular attention: they are the only records with no
 * `userId` of their own, so their ownership is enforced through a relation
 * filter on the project.
 */
const d = localDateToDbDate;
const RANGE = getViewRange("month", "2026-09-15");
const DATE = d("2026-09-16");

let owner: TestUser;
let intruder: TestUser;

beforeEach(async () => {
  await resetDatabase();
  owner = await createTestUser();
  intruder = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("cross-user reads", () => {
  it("shows an intruder none of the owner's dated records", async () => {
    const project = await createTestProject(owner.id, {
      name: "Secret project",
      startDate: DATE,
      dueDate: DATE,
    });
    await createTestMilestone(project.id, { title: "Secret milestone", dueDate: DATE });
    await createTestTask(owner.id, { title: "Secret task", dueDate: DATE });
    await createTestGoal(owner.id, {
      title: "Secret goal",
      startDate: DATE,
      targetDate: DATE,
    });

    expect(await getCalendarItems(owner.id, RANGE)).toHaveLength(6);
    expect(await getCalendarItems(intruder.id, RANGE)).toEqual([]);
  });

  it("leaks nothing when both users have items on the same day", async () => {
    await createTestTask(owner.id, { title: "Owner task", dueDate: DATE });
    await createTestTask(intruder.id, { title: "Intruder task", dueDate: DATE });

    const items = await getCalendarItems(intruder.id, RANGE);
    expect(items.map((item) => item.title)).toEqual(["Intruder task"]);
  });

  it("does not reach a foreign milestone through its project", async () => {
    // The milestone table has no userId at all. If ownership were checked
    // anywhere but on the project relation, this is where it would leak.
    const project = await createTestProject(owner.id, { name: "Owner project" });
    await createTestMilestone(project.id, { title: "Owner milestone", dueDate: DATE });

    expect(await getCalendarItems(intruder.id, RANGE, { kinds: ["milestone"] })).toEqual([]);
  });

  it("does not reach a foreign project through a shared goal title", async () => {
    const goal = await createTestGoal(owner.id, { title: "Owner goal", targetDate: DATE });
    await createTestProject(owner.id, { name: "Owner project", dueDate: DATE, goalId: goal.id });

    expect(await getCalendarItems(intruder.id, RANGE)).toEqual([]);
  });

  it("holds for every kind filter an intruder could ask for", async () => {
    const project = await createTestProject(owner.id, { name: "P", startDate: DATE, dueDate: DATE });
    await createTestMilestone(project.id, { title: "M", dueDate: DATE });
    await createTestTask(owner.id, { title: "T", dueDate: DATE });
    await createTestGoal(owner.id, { title: "G", startDate: DATE, targetDate: DATE });

    for (const kind of ["task", "milestone", "project", "goal"] as const) {
      expect(await getCalendarItems(intruder.id, RANGE, { kinds: [kind] })).toEqual([]);
    }
    for (const show of ["all", "open"] as const) {
      expect(await getCalendarItems(intruder.id, RANGE, { show })).toEqual([]);
    }
  });

  it("holds across every view's range", async () => {
    await createTestTask(owner.id, { title: "T", dueDate: d("2026-09-16") });

    for (const view of ["day", "week", "month", "timeline"] as const) {
      const range = getViewRange(view, "2026-09-16");
      expect(await getCalendarItems(intruder.id, range)).toEqual([]);
    }
  });
});

describe("a user id is the only thing that scopes a read", () => {
  it("returns an empty calendar for an id that belongs to nobody", async () => {
    await createTestTask(owner.id, { title: "T", dueDate: DATE });

    // Indistinguishable from a real user with nothing on that day — a
    // non-existent id must not be detectable from the response.
    expect(await getCalendarItems("clnonexistentid000000000", RANGE)).toEqual([]);
    expect(await getCalendarItems(intruder.id, RANGE)).toEqual([]);
  });

  it("is not satisfied by a foreign record's own id appearing anywhere", async () => {
    const project = await createTestProject(owner.id, { name: "P", dueDate: DATE });
    const items = await getCalendarItems(owner.id, RANGE);

    // The owner sees their project; the intruder, asking with the same range
    // and knowing the id, still sees nothing.
    expect(items.map((item) => item.sourceId)).toContain(project.id);
    const intruderItems = await getCalendarItems(intruder.id, RANGE);
    expect(intruderItems.map((item) => item.sourceId)).not.toContain(project.id);
  });
});

describe("deleted and reassigned records", () => {
  it("stops showing a project's milestone once the project is gone", async () => {
    const { db } = await import("./helpers");
    const project = await createTestProject(owner.id, { name: "P", dueDate: DATE });
    await createTestMilestone(project.id, { title: "M", dueDate: DATE });

    expect(await getCalendarItems(owner.id, RANGE)).toHaveLength(2);

    await db.project.delete({ where: { id: project.id } });

    // Milestones cascade with their project; tasks do not, which is the
    // delete policy the earlier phases established.
    expect(await getCalendarItems(owner.id, RANGE)).toEqual([]);
  });

  it("keeps a task on the calendar after its project is deleted", async () => {
    const { db } = await import("./helpers");
    const project = await createTestProject(owner.id, { name: "P" });
    await createTestTask(owner.id, { title: "T", dueDate: DATE, projectId: project.id });

    await db.project.delete({ where: { id: project.id } });

    const items = await getCalendarItems(owner.id, RANGE);
    expect(items.map((item) => item.title)).toEqual(["T"]);
    // Its project chip is gone, because the project is; the work is not.
    expect(items[0]?.context).toBeNull();
    expect(items[0]?.href).toBe("/app/tasks?status=all");
  });
});
