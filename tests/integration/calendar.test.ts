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
 * The calendar reads the real records. These tests assert that what the grid
 * shows is exactly what the task, milestone, project and goal tables say —
 * because nothing else could make it agree, there being no calendar table.
 */
const d = localDateToDbDate;
const WEEK = getViewRange("week", "2026-09-14"); // Mon 14 – Sun 20 Sep 2026

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("sources", () => {
  it("reads a task's own due date and time", async () => {
    await createTestTask(user.id, {
      title: "Ship the thing",
      dueDate: d("2026-09-17"),
      dueTime: "14:30",
      priority: "HIGH",
    });

    const items = await getCalendarItems(user.id, WEEK);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "task",
      anchor: "due",
      title: "Ship the thing",
      date: "2026-09-17",
      time: "14:30",
      completed: false,
      priority: "HIGH",
    });
  });

  it("reads a milestone through the project that owns it", async () => {
    const project = await createTestProject(user.id, { name: "Relaunch", color: "cyan" });
    await createTestMilestone(project.id, { title: "Beta", dueDate: d("2026-09-18") });

    const items = await getCalendarItems(user.id, WEEK, { kinds: ["milestone"] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "milestone",
      date: "2026-09-18",
      title: "Beta",
      context: "Relaunch",
      color: "cyan",
      time: null,
    });
  });

  it("gives a project with two dates two items, one per anchor", async () => {
    const project = await createTestProject(user.id, {
      name: "Relaunch",
      startDate: d("2026-09-15"),
      dueDate: d("2026-09-19"),
    });

    const items = await getCalendarItems(user.id, WEEK, { kinds: ["project"] });

    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.anchor, item.date])).toEqual([
      ["start", "2026-09-15"],
      ["due", "2026-09-19"],
    ]);
    // Two facts about one project, not two projects.
    expect(new Set(items.map((item) => item.sourceId))).toEqual(new Set([project.id]));
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });

  it("only draws the anchor that actually falls inside the range", async () => {
    await createTestProject(user.id, {
      name: "Long haul",
      startDate: d("2026-01-01"),
      dueDate: d("2026-09-16"),
    });

    const items = await getCalendarItems(user.id, WEEK, { kinds: ["project"] });

    expect(items).toHaveLength(1);
    expect(items[0]?.anchor).toBe("due");
  });

  it("reads a goal's start and target dates", async () => {
    await createTestGoal(user.id, {
      title: "Get fit",
      startDate: d("2026-09-14"),
      targetDate: d("2026-09-20"),
    });

    const items = await getCalendarItems(user.id, WEEK, { kinds: ["goal"] });

    expect(items.map((item) => [item.anchor, item.date])).toEqual([
      ["start", "2026-09-14"],
      ["due", "2026-09-20"],
    ]);
  });

  it("ignores records with no date at all", async () => {
    await createTestTask(user.id, { title: "Someday" });
    await createTestProject(user.id, { name: "Undated" });
    await createTestGoal(user.id, { title: "Undated goal" });

    expect(await getCalendarItems(user.id, WEEK)).toEqual([]);
  });
});

describe("range bounds", () => {
  beforeEach(async () => {
    for (const date of ["2026-09-13", "2026-09-14", "2026-09-20", "2026-09-21"]) {
      await createTestTask(user.id, { title: date, dueDate: d(date) });
    }
  });

  it("is inclusive at both ends and excludes everything outside", async () => {
    const items = await getCalendarItems(user.id, WEEK);
    expect(items.map((item) => item.date)).toEqual(["2026-09-14", "2026-09-20"]);
  });

  it("returns a single day for the day view", async () => {
    const items = await getCalendarItems(user.id, getViewRange("day", "2026-09-14"));
    expect(items.map((item) => item.date)).toEqual(["2026-09-14"]);
  });

  it("returns nothing, rather than everything, for an inverted range", async () => {
    expect(await getCalendarItems(user.id, { start: "2026-09-20", end: "2026-09-14" })).toEqual(
      [],
    );
  });

  it("refuses an unbounded range instead of scanning the table", async () => {
    expect(await getCalendarItems(user.id, { start: "1970-01-01", end: "2999-12-31" })).toEqual(
      [],
    );
  });
});

describe("date fidelity", () => {
  it("never shifts a day, at either end of the year", async () => {
    // A @db.Date read in the server's local zone is the classic off-by-one.
    for (const date of ["2026-01-01", "2026-12-31", "2026-06-30"]) {
      await createTestTask(user.id, { title: date, dueDate: d(date) });
      const items = await getCalendarItems(user.id, { start: date, end: date });
      expect(items[0]?.date).toBe(date);
    }
  });

  it("gives the same answer for a user in a far-flung timezone", async () => {
    const traveller = await createTestUser({ timezone: "Pacific/Kiritimati" });
    await createTestTask(traveller.id, { title: "Dated", dueDate: d("2026-09-17") });

    const items = await getCalendarItems(traveller.id, WEEK);
    expect(items[0]?.date).toBe("2026-09-17");
  });
});

describe("completion", () => {
  it("reports completion from explicit state, never from the date passing", async () => {
    await createTestTask(user.id, { title: "Old", dueDate: d("2026-09-15") });
    const project = await createTestProject(user.id, {
      name: "Done project",
      dueDate: d("2026-09-15"),
      status: "COMPLETED",
    });
    await createTestMilestone(project.id, {
      title: "Done milestone",
      dueDate: d("2026-09-15"),
      status: "COMPLETED",
    });

    const items = await getCalendarItems(user.id, WEEK);
    const byKind = Object.fromEntries(items.map((item) => [item.kind, item.completed]));

    // Every one of these dates is in the past relative to nothing in
    // particular — completion came from the record, not the calendar.
    expect(byKind).toEqual({ task: false, project: true, milestone: true });
  });

  it("drops finished work in SQL when asked for open items only", async () => {
    await createTestTask(user.id, { title: "Open", dueDate: d("2026-09-16") });
    await createTestTask(user.id, {
      title: "Done",
      dueDate: d("2026-09-16"),
      completed: true,
    });
    const project = await createTestProject(user.id, {
      name: "Archived",
      dueDate: d("2026-09-16"),
      status: "ARCHIVED",
    });
    await createTestMilestone(project.id, {
      title: "Done milestone",
      dueDate: d("2026-09-16"),
      status: "COMPLETED",
    });
    await createTestGoal(user.id, {
      title: "Achieved",
      targetDate: d("2026-09-16"),
      status: "COMPLETED",
    });

    const open = await getCalendarItems(user.id, WEEK, { show: "open" });
    expect(open.map((item) => item.title)).toEqual(["Open"]);

    const all = await getCalendarItems(user.id, WEEK, { show: "all" });
    expect(all).toHaveLength(5);
  });
});

describe("kind filtering", () => {
  beforeEach(async () => {
    const project = await createTestProject(user.id, {
      name: "P",
      dueDate: d("2026-09-16"),
    });
    await createTestMilestone(project.id, { title: "M", dueDate: d("2026-09-16") });
    await createTestTask(user.id, { title: "T", dueDate: d("2026-09-16") });
    await createTestGoal(user.id, { title: "G", targetDate: d("2026-09-16") });
  });

  it("reads only the sources asked for", async () => {
    const items = await getCalendarItems(user.id, WEEK, { kinds: ["task", "goal"] });
    expect(items.map((item) => item.kind).sort()).toEqual(["goal", "task"]);
  });

  it("treats an empty selection as no filter", async () => {
    expect(await getCalendarItems(user.id, WEEK, { kinds: [] })).toHaveLength(4);
  });
});

describe("ordering and links", () => {
  it("returns a day already ordered, timed items first", async () => {
    await createTestTask(user.id, { title: "All day", dueDate: d("2026-09-16") });
    await createTestTask(user.id, {
      title: "Morning",
      dueDate: d("2026-09-16"),
      dueTime: "09:00",
    });
    await createTestGoal(user.id, { title: "Goal", targetDate: d("2026-09-16") });

    const items = await getCalendarItems(user.id, WEEK);
    expect(items.map((item) => item.title)).toEqual(["Morning", "Goal", "All day"]);
  });

  it("links every item to its real record, never to a calendar record", async () => {
    const project = await createTestProject(user.id, { name: "P", dueDate: d("2026-09-16") });
    const milestone = await createTestMilestone(project.id, {
      title: "M",
      dueDate: d("2026-09-16"),
    });
    const goal = await createTestGoal(user.id, { title: "G", targetDate: d("2026-09-16") });
    await createTestTask(user.id, {
      title: "T",
      dueDate: d("2026-09-16"),
      projectId: project.id,
      milestoneId: milestone.id,
    });
    await createTestTask(user.id, { title: "Loose", dueDate: d("2026-09-16") });

    const byTitle = Object.fromEntries(
      (await getCalendarItems(user.id, WEEK)).map((item) => [item.title, item.href]),
    );

    expect(byTitle["P"]).toBe(`/app/projects/${project.id}`);
    expect(byTitle["M"]).toBe(`/app/projects/${project.id}`);
    expect(byTitle["G"]).toBe(`/app/goals/${goal.id}`);
    expect(byTitle["T"]).toBe(`/app/projects/${project.id}`);
    expect(byTitle["Loose"]).toBe("/app/tasks?status=all");
    expect(Object.values(byTitle).every((href) => !href.includes("/calendar/"))).toBe(true);
  });

  it("gives every item a distinct id within one render", async () => {
    await createTestProject(user.id, {
      name: "Both",
      startDate: d("2026-09-15"),
      dueDate: d("2026-09-16"),
    });
    await createTestTask(user.id, { title: "T", dueDate: d("2026-09-16") });

    const items = await getCalendarItems(user.id, WEEK);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});

describe("agreement with the underlying records", () => {
  it("shows a moved due date immediately, with nothing to keep in sync", async () => {
    const task = await createTestTask(user.id, { title: "Moves", dueDate: d("2026-09-15") });

    expect((await getCalendarItems(user.id, WEEK))[0]?.date).toBe("2026-09-15");

    // The only write is to the task itself — there is no calendar row to update.
    const { db } = await import("./helpers");
    await db.task.update({ where: { id: task.id }, data: { dueDate: d("2026-09-18") } });

    expect((await getCalendarItems(user.id, WEEK))[0]?.date).toBe("2026-09-18");
  });

  it("drops an item the moment its date is cleared", async () => {
    const task = await createTestTask(user.id, { title: "Undated", dueDate: d("2026-09-15") });
    const { db } = await import("./helpers");
    await db.task.update({ where: { id: task.id }, data: { dueDate: null } });

    expect(await getCalendarItems(user.id, WEEK)).toEqual([]);
  });
});
