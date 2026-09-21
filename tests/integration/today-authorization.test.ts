import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { localDateTimeToInstant, localDateToDbDate } from "@/lib/datetime";
import { getTodayData } from "@/lib/today/queries";
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
 * The Today page reads eleven queries at once, which makes it the widest read
 * surface added since the calendar. Every case here gives two users an
 * identical set of tasks and asserts that each sees only their own — on every
 * section, on every kind of day.
 */
const d = localDateToDbDate;
const TODAY = "2026-09-21";

let owner: TestUser;
let intruder: TestUser;

/** The same four-task shape for anybody, so the sets are directly comparable. */
async function fillCalendar(user: TestUser, prefix: string) {
  const goal = await createTestGoal(user.id, { title: `${prefix} goal` });
  const project = await createTestProject(user.id, { name: `${prefix} project`, goalId: goal.id });
  const milestone = await createTestMilestone(project.id, { title: `${prefix} milestone` });

  await createTestTask(user.id, {
    title: `${prefix} overdue`,
    dueDate: d("2026-09-15"),
    estimatedMinutes: 60,
  });
  await createTestTask(user.id, {
    title: `${prefix} today`,
    dueDate: d(TODAY),
    dueTime: "09:00",
    estimatedMinutes: 30,
    projectId: project.id,
    milestoneId: milestone.id,
  });
  await createTestTask(user.id, { title: `${prefix} future`, dueDate: d("2026-09-24") });
  await createTestTask(user.id, { title: `${prefix} unscheduled` });
  await createTestTask(user.id, {
    title: `${prefix} done today`,
    dueDate: d(TODAY),
    completed: true,
    completedAt: localDateTimeToInstant(TODAY, "08:00", "UTC"),
  });

  return { goal, project, milestone };
}

/** Every task title anywhere in a day's payload. */
function titlesIn(data: Awaited<ReturnType<typeof getTodayData>>): string[] {
  return [
    ...data.sections.timed,
    ...data.sections.allDay,
    ...data.sections.completed,
    ...data.overdue.tasks,
    ...data.alsoCompleted.tasks,
    ...data.upcoming.tasks,
    ...data.unscheduled.tasks,
  ].map((task) => task.title);
}

beforeEach(async () => {
  await resetDatabase();
  owner = await createTestUser();
  intruder = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("cross-user isolation", () => {
  it("shows an intruder none of the owner's work, in any section", async () => {
    await fillCalendar(owner, "owner");

    const ownerData = await getTodayData(owner.id, "UTC", TODAY, TODAY);
    const intruderData = await getTodayData(intruder.id, "UTC", TODAY, TODAY);

    expect(titlesIn(ownerData)).toHaveLength(5);
    expect(titlesIn(intruderData)).toEqual([]);
    expect(intruderData.progress.total).toBe(0);
    expect(intruderData.overdue.total).toBe(0);
    expect(intruderData.upcoming.total).toBe(0);
    expect(intruderData.unscheduled.total).toBe(0);
    expect(intruderData.alsoCompleted.total).toBe(0);
  });

  it("keeps two users' identical days apart", async () => {
    await fillCalendar(owner, "owner");
    await fillCalendar(intruder, "intruder");

    const ownerTitles = titlesIn(await getTodayData(owner.id, "UTC", TODAY, TODAY));
    const intruderTitles = titlesIn(await getTodayData(intruder.id, "UTC", TODAY, TODAY));

    expect(ownerTitles.every((title) => title.startsWith("owner"))).toBe(true);
    expect(intruderTitles.every((title) => title.startsWith("intruder"))).toBe(true);
    expect(ownerTitles).toHaveLength(5);
    expect(intruderTitles).toHaveLength(5);
  });

  it("holds on a historical day", async () => {
    await createTestTask(owner.id, { title: "owner past", dueDate: d("2026-09-15") });

    const data = await getTodayData(intruder.id, "UTC", "2026-09-15", TODAY);

    expect(titlesIn(data)).toEqual([]);
    expect(data.progress.total).toBe(0);
  });

  it("holds on a future day", async () => {
    await createTestTask(owner.id, { title: "owner future", dueDate: d("2026-10-01") });

    const data = await getTodayData(intruder.id, "UTC", "2026-10-01", TODAY);

    expect(titlesIn(data)).toEqual([]);
  });

  it("holds for every day across a whole month", async () => {
    await fillCalendar(owner, "owner");

    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      const data = await getTodayData(intruder.id, "UTC", date, TODAY);
      expect(titlesIn(data)).toEqual([]);
    }
  });

  it("does not leak another user's XP ledger", async () => {
    const task = await createTestTask(owner.id, { title: "owner", dueDate: d(TODAY) });
    await db.xpTransaction.create({
      data: {
        userId: owner.id,
        taskId: task.id,
        amount: 500,
        cycle: 0,
        createdAt: localDateTimeToInstant(TODAY, "10:00", "UTC"),
      },
    });

    expect((await getTodayData(owner.id, "UTC", TODAY, TODAY)).xpEarned).toBe(500);
    expect((await getTodayData(intruder.id, "UTC", TODAY, TODAY)).xpEarned).toBe(0);
  });

  it("does not leak another user's streak", async () => {
    await db.userStats.update({
      where: { userId: owner.id },
      data: { currentStreak: 12, longestStreak: 30, lastCompletedDate: TODAY },
    });

    expect((await getTodayData(owner.id, "UTC", TODAY, TODAY)).streak.current).toBe(12);
    expect((await getTodayData(intruder.id, "UTC", TODAY, TODAY)).streak.current).toBe(0);
  });

  it("does not leak workload or progress figures", async () => {
    await createTestTask(owner.id, {
      title: "owner",
      dueDate: d(TODAY),
      estimatedMinutes: 240,
    });

    const data = await getTodayData(intruder.id, "UTC", TODAY, TODAY);

    expect(data.workload.planned).toBe(0);
    expect(data.progress.total).toBe(0);
  });
});

describe("relationship metadata never crosses an account", () => {
  it("does not expose a foreign project, milestone or goal", async () => {
    const { project, milestone, goal } = await fillCalendar(owner, "owner");

    // The intruder owns a task on the same day, so the query definitely runs.
    await createTestTask(intruder.id, { title: "intruder today", dueDate: d(TODAY) });

    const data = await getTodayData(intruder.id, "UTC", TODAY, TODAY);
    const payload = JSON.stringify(data);

    expect(payload).not.toContain(project.id);
    expect(payload).not.toContain(milestone.id);
    expect(payload).not.toContain(goal.id);
    expect(payload).not.toContain("owner project");
    expect(payload).not.toContain("owner goal");
  });

  it("cannot be reached by a task pointing at a foreign project", async () => {
    // Assignment is guarded elsewhere; this pins that the Today read does not
    // become the hole even if a row somehow referenced a foreign project.
    const { project } = await fillCalendar(owner, "owner");
    const task = await createTestTask(intruder.id, { title: "intruder", dueDate: d(TODAY) });

    await db.task.update({ where: { id: task.id }, data: { projectId: project.id } });

    const data = await getTodayData(owner.id, "UTC", TODAY, TODAY);

    // The owner sees their own tasks only — never the intruder's, whatever it
    // points at.
    expect(titlesIn(data).some((title) => title.startsWith("intruder"))).toBe(false);
  });
});

describe("an unknown user id is indistinguishable from an empty account", () => {
  it("returns an empty day rather than an error or someone else's data", async () => {
    await fillCalendar(owner, "owner");

    const ghost = await getTodayData("clnonexistentid000000000", "UTC", TODAY, TODAY);
    const empty = await getTodayData(intruder.id, "UTC", TODAY, TODAY);

    expect(titlesIn(ghost)).toEqual([]);
    expect(ghost.xpEarned).toBe(0);
    expect(ghost.streak.current).toBe(0);
    // Byte-identical to a real account with nothing in it: existence of an
    // account must not be detectable from the response.
    expect(JSON.stringify(ghost)).toBe(JSON.stringify(empty));
  });
});
