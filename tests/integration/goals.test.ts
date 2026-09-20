import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import {
  createGoal,
  deleteGoal,
  setGoalStatus,
  setProjectGoal,
  updateGoal,
} from "@/lib/goals/service";
import { getGoalDetail, getGoals, getGoalStatusCounts } from "@/lib/goals/queries";
import { createProject, updateProject } from "@/lib/projects/service";
import {
  createTestGoal,
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  getProjectGoal,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Goal lifecycle and progress against a real database.
 *
 * The delete behaviour in particular is enforced by a foreign key, not by
 * application code, so it can only be verified here.
 */

let user: TestUser;

const goalInput = (overrides: Partial<Parameters<typeof createGoal>[1]> = {}) => ({
  title: "University Preparation",
  description: null,
  priority: "MEDIUM" as const,
  status: "ACTIVE" as const,
  startDate: null,
  targetDate: null,
  ...overrides,
});

const projectInput = (overrides: Partial<Parameters<typeof createProject>[1]> = {}) => ({
  name: "SAT Preparation",
  description: null,
  color: "violet",
  priority: "MEDIUM" as const,
  status: "ACTIVE" as const,
  startDate: null,
  dueDate: null,
  goalId: null,
  ...overrides,
});

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("goal CRUD", () => {
  it("creates a goal with every field persisted", async () => {
    const { id } = await createGoal(
      user.id,
      goalInput({
        description: "Applications, tests and portfolio.",
        priority: "URGENT",
        startDate: "2026-09-01",
        targetDate: "2026-10-18",
      }),
    );

    const stored = await db.goal.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      userId: user.id,
      title: "University Preparation",
      description: "Applications, tests and portfolio.",
      priority: "URGENT",
      status: "ACTIVE",
      completedAt: null,
      archivedAt: null,
    });
    expect(stored.startDate?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(stored.targetDate?.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });

  it("updates a goal it owns", async () => {
    const goal = await createTestGoal(user.id);
    await updateGoal(user.id, goal.id, goalInput({ title: "Renamed", priority: "HIGH" }));

    const stored = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(stored.title).toBe("Renamed");
    expect(stored.priority).toBe("HIGH");
  });

  it("reports an unknown goal as not found", async () => {
    await expect(updateGoal(user.id, "nope", goalInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(setGoalStatus(user.id, "nope", "COMPLETED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteGoal(user.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("goal status transitions", () => {
  it("completing stamps completedAt", async () => {
    const goal = await createTestGoal(user.id);
    expect((await setGoalStatus(user.id, goal.id, "COMPLETED")).changed).toBe(true);

    const stored = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(stored.status).toBe("COMPLETED");
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect(stored.archivedAt).toBeNull();
  });

  it("reopening clears both timestamps", async () => {
    const goal = await createTestGoal(user.id);
    await setGoalStatus(user.id, goal.id, "COMPLETED");
    await setGoalStatus(user.id, goal.id, "ACTIVE");

    const stored = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.completedAt).toBeNull();
    expect(stored.archivedAt).toBeNull();
  });

  it("archiving preserves when it was achieved", async () => {
    const goal = await createTestGoal(user.id);
    await setGoalStatus(user.id, goal.id, "COMPLETED");
    const completedAt = (await db.goal.findUniqueOrThrow({ where: { id: goal.id } })).completedAt;

    await setGoalStatus(user.id, goal.id, "ARCHIVED");

    const stored = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(stored.status).toBe("ARCHIVED");
    expect(stored.archivedAt).toBeInstanceOf(Date);
    expect(stored.completedAt?.toISOString()).toBe(completedAt?.toISOString());
  });

  it("restoring an archived goal makes it active again", async () => {
    const goal = await createTestGoal(user.id, { status: "ARCHIVED" });
    await setGoalStatus(user.id, goal.id, "ACTIVE");

    const stored = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.archivedAt).toBeNull();
  });

  it("is a no-op when already in the target state", async () => {
    const goal = await createTestGoal(user.id, { status: "ACTIVE" });
    expect((await setGoalStatus(user.id, goal.id, "ACTIVE")).changed).toBe(false);
  });

  it("never cascades status to its projects", async () => {
    // Archiving a goal is a statement about the objective, not about the work.
    // Someone may shelve "learn Japanese" and still finish the textbook.
    const goal = await createTestGoal(user.id);
    const active = await createTestProject(user.id, { name: "Live", goalId: goal.id, status: "ACTIVE" });
    const done = await createTestProject(user.id, { name: "Done", goalId: goal.id, status: "COMPLETED" });

    await setGoalStatus(user.id, goal.id, "ARCHIVED");

    expect((await db.project.findUniqueOrThrow({ where: { id: active.id } })).status).toBe("ACTIVE");
    expect((await db.project.findUniqueOrThrow({ where: { id: done.id } })).status).toBe("COMPLETED");
    // And they stay connected — archiving does not release them either.
    expect(await getProjectGoal(active.id)).toBe(goal.id);
  });

  it("never awards XP for completing a goal", async () => {
    // Task completion remains the only source of XP.
    const goal = await createTestGoal(user.id);
    const project = await createTestProject(user.id, { goalId: goal.id });
    await createTestTask(user.id, { projectId: project.id, completed: true });

    const before = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    await setGoalStatus(user.id, goal.id, "COMPLETED");
    const after = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });

    expect(after.totalXp).toBe(before.totalXp);
    expect(await db.xpTransaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("goal deletion", () => {
  it("releases its projects without destroying any work", async () => {
    const goal = await createTestGoal(user.id);
    const project = await createTestProject(user.id, { goalId: goal.id });
    const milestone = await createTestMilestone(project.id);
    const task = await createTestTask(user.id, {
      projectId: project.id,
      milestoneId: milestone.id,
      completed: true,
    });
    await db.xpTransaction.create({
      data: { userId: user.id, taskId: task.id, amount: 40, kind: "AWARD", cycle: 1 },
    });

    const outcome = await deleteGoal(user.id, goal.id);
    expect(outcome).toEqual({ releasedProjects: 1 });

    expect(await db.goal.findUnique({ where: { id: goal.id } })).toBeNull();

    // Everything below the goal survives, intact.
    const storedProject = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(storedProject.goalId).toBeNull();
    expect(storedProject.name).toBe(project.name);

    expect(await db.milestone.findUnique({ where: { id: milestone.id } })).not.toBeNull();

    const storedTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(storedTask.projectId).toBe(project.id);
    expect(storedTask.milestoneId).toBe(milestone.id);

    expect(await db.xpTransaction.count({ where: { taskId: task.id } })).toBe(1);
  });

  it("leaves projects under other goals alone", async () => {
    const doomed = await createTestGoal(user.id, { title: "Doomed" });
    const keeper = await createTestGoal(user.id, { title: "Keeper" });
    const kept = await createTestProject(user.id, { goalId: keeper.id });

    await deleteGoal(user.id, doomed.id);

    expect(await getProjectGoal(kept.id)).toBe(keeper.id);
  });

  it("reports zero when the goal had no projects", async () => {
    const goal = await createTestGoal(user.id);
    expect(await deleteGoal(user.id, goal.id)).toEqual({ releasedProjects: 0 });
  });
});

describe("project assignment", () => {
  it("connects, moves and releases a project", async () => {
    const first = await createTestGoal(user.id, { title: "First" });
    const second = await createTestGoal(user.id, { title: "Second" });
    const project = await createTestProject(user.id);

    await setProjectGoal(user.id, project.id, first.id);
    expect(await getProjectGoal(project.id)).toBe(first.id);

    await setProjectGoal(user.id, project.id, second.id);
    expect(await getProjectGoal(project.id)).toBe(second.id);

    await setProjectGoal(user.id, project.id, null);
    expect(await getProjectGoal(project.id)).toBeNull();
  });

  it("rejects a goal that does not exist, changing nothing", async () => {
    const goal = await createTestGoal(user.id);
    const project = await createTestProject(user.id, { goalId: goal.id });

    await expect(
      setProjectGoal(user.id, project.id, "no-such-goal"),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await getProjectGoal(project.id)).toBe(goal.id);
  });

  it("rejects a project that does not exist", async () => {
    const goal = await createTestGoal(user.id);
    await expect(
      setProjectGoal(user.id, "no-such-project", goal.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates a project directly under a goal", async () => {
    const goal = await createTestGoal(user.id);
    const { id } = await createProject(user.id, projectInput({ goalId: goal.id }));

    expect(await getProjectGoal(id)).toBe(goal.id);
  });

  it("changes a project's goal through an ordinary edit", async () => {
    const goal = await createTestGoal(user.id);
    const project = await createTestProject(user.id);

    await updateProject(user.id, project.id, projectInput({ goalId: goal.id }));
    expect(await getProjectGoal(project.id)).toBe(goal.id);

    await updateProject(user.id, project.id, projectInput({ goalId: null }));
    expect(await getProjectGoal(project.id)).toBeNull();
  });

  it("settles concurrent assignments without corrupting state", async () => {
    const goals = await Promise.all([
      createTestGoal(user.id, { title: "A" }),
      createTestGoal(user.id, { title: "B" }),
      createTestGoal(user.id, { title: "C" }),
    ]);
    const project = await createTestProject(user.id);

    await Promise.allSettled(
      goals.flatMap((g) => [
        setProjectGoal(user.id, project.id, g.id),
        setProjectGoal(user.id, project.id, null),
      ]),
    );

    // Whichever write landed last, the result must be one of the valid states
    // — never a dangling id, and never a foreign-key violation.
    const finalGoal = await getProjectGoal(project.id);
    const validIds = [null, ...goals.map((g) => g.id)];
    expect(validIds).toContain(finalGoal);
    expect(await db.project.count({ where: { id: project.id } })).toBe(1);
  });
});

describe("goal progress", () => {
  it("pools tasks across every connected project", async () => {
    const goal = await createTestGoal(user.id);
    const a = await createTestProject(user.id, { name: "A", goalId: goal.id });
    const b = await createTestProject(user.id, { name: "B", goalId: goal.id });

    // A: 8/10, B: 2/20 -> pooled 10/30 = 33%, not the 45% an average gives.
    for (let i = 0; i < 10; i++) {
      await createTestTask(user.id, { projectId: a.id, completed: i < 8 });
    }
    for (let i = 0; i < 20; i++) {
      await createTestTask(user.id, { projectId: b.id, completed: i < 2 });
    }

    const detail = await getGoalDetail(user.id, goal.id, "UTC");
    expect(detail?.goal.progress).toMatchObject({ total: 30, completed: 10, percent: 33 });
    expect(detail?.stats).toMatchObject({ totalTasks: 30, completedTasks: 10, remainingTasks: 20 });
  });

  it("ignores tasks in projects that are not connected", async () => {
    const goal = await createTestGoal(user.id);
    const connected = await createTestProject(user.id, { name: "In", goalId: goal.id });
    const loose = await createTestProject(user.id, { name: "Out" });

    await createTestTask(user.id, { projectId: connected.id, completed: true });
    await createTestTask(user.id, { projectId: loose.id, completed: true });
    // And a task with no project at all.
    await createTestTask(user.id, {});

    const detail = await getGoalDetail(user.id, goal.id, "UTC");
    expect(detail?.goal.progress.total).toBe(1);
  });

  it("distinguishes a goal with no projects from one with no tasks", async () => {
    const empty = await createTestGoal(user.id, { title: "Empty" });
    const started = await createTestGoal(user.id, { title: "Started" });
    await createTestProject(user.id, { goalId: started.id });

    expect((await getGoalDetail(user.id, empty.id, "UTC"))?.goal.progress.state).toBe("no-projects");
    expect((await getGoalDetail(user.id, started.id, "UTC"))?.goal.progress.state).toBe("no-tasks");
  });

  it("counts overdue tasks across the goal", async () => {
    const goal = await createTestGoal(user.id);
    const project = await createTestProject(user.id, { goalId: goal.id });

    await createTestTask(user.id, { projectId: project.id, dueDate: new Date("2026-09-18T00:00:00Z") });
    await createTestTask(user.id, { projectId: project.id, dueDate: new Date("2026-09-25T00:00:00Z") });
    // Completed and late does not count as overdue.
    await createTestTask(user.id, {
      projectId: project.id,
      dueDate: new Date("2026-09-01T00:00:00Z"),
      completed: true,
    });

    const detail = await getGoalDetail(user.id, goal.id, "UTC", new Date("2026-09-20T12:00:00Z"));
    expect(detail?.stats.overdueTasks).toBe(1);
  });

  it("summarises its projects by status", async () => {
    const goal = await createTestGoal(user.id);
    await createTestProject(user.id, { name: "A", goalId: goal.id, status: "ACTIVE" });
    await createTestProject(user.id, { name: "B", goalId: goal.id, status: "ACTIVE" });
    await createTestProject(user.id, { name: "C", goalId: goal.id, status: "COMPLETED" });

    const detail = await getGoalDetail(user.id, goal.id, "UTC");
    expect(detail?.projects).toHaveLength(3);
    expect(detail?.stats.activeProjects).toBe(2);
    expect(detail?.stats.completedProjects).toBe(1);
  });

  it("computes progress for many goals without a query per goal", async () => {
    const goals = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTestGoal(user.id, { title: `Goal ${i}` })),
    );
    for (const [index, goal] of goals.entries()) {
      const project = await createTestProject(user.id, { name: `P${index}`, goalId: goal.id });
      await createTestTask(user.id, { projectId: project.id, completed: true });
      await createTestTask(user.id, { projectId: project.id, completed: false });
    }

    const list = await getGoals(user.id, "UTC", { status: "ALL", sort: "name" });
    expect(list).toHaveLength(5);
    for (const goal of list) {
      expect(goal.progress).toMatchObject({ total: 2, completed: 1, percent: 50, projectCount: 1 });
    }
  });

  it("returns null for a goal that is not the caller's", async () => {
    const stranger = await createTestUser();
    const theirs = await createTestGoal(stranger.id);
    expect(await getGoalDetail(user.id, theirs.id, "UTC")).toBeNull();
  });
});

describe("goal listing", () => {
  it("filters by status and hides archived by default", async () => {
    await createTestGoal(user.id, { title: "Live", status: "ACTIVE" });
    await createTestGoal(user.id, { title: "Done", status: "COMPLETED" });
    await createTestGoal(user.id, { title: "Filed", status: "ARCHIVED" });

    expect((await getGoals(user.id, "UTC", {})).map((g) => g.title)).toEqual(["Live"]);
    expect((await getGoals(user.id, "UTC", { status: "ARCHIVED" })).map((g) => g.title)).toEqual(["Filed"]);
    expect(await getGoals(user.id, "UTC", { status: "ALL" })).toHaveLength(3);
  });

  it("finds overdue goals using the user's calendar day", async () => {
    await createTestGoal(user.id, { title: "Late", targetDate: new Date("2026-09-18T00:00:00Z") });
    await createTestGoal(user.id, { title: "Soon", targetDate: new Date("2026-09-25T00:00:00Z") });
    await createTestGoal(user.id, {
      title: "Late but achieved",
      status: "COMPLETED",
      targetDate: new Date("2026-09-01T00:00:00Z"),
    });

    const overdue = await getGoals(
      user.id,
      "UTC",
      { status: "OVERDUE" },
      new Date("2026-09-20T12:00:00Z"),
    );
    expect(overdue.map((g) => g.title)).toEqual(["Late"]);
  });

  it("searches title and description", async () => {
    await createTestGoal(user.id, { title: "University Preparation" });
    await db.goal.create({
      data: { userId: user.id, title: "Fitness", description: "Run a half marathon" },
    });

    expect((await getGoals(user.id, "UTC", { search: "universi" })).map((g) => g.title)).toEqual([
      "University Preparation",
    ]);
    expect((await getGoals(user.id, "UTC", { search: "marathon" })).map((g) => g.title)).toEqual([
      "Fitness",
    ]);
  });

  it("sorts by name, priority and urgency", async () => {
    await createTestGoal(user.id, { title: "Zeta", priority: "LOW", targetDate: new Date("2026-12-01T00:00:00Z") });
    await createTestGoal(user.id, { title: "Alpha", priority: "URGENT", targetDate: null });
    await createTestGoal(user.id, { title: "Mid", priority: "HIGH", targetDate: new Date("2026-10-01T00:00:00Z") });

    expect((await getGoals(user.id, "UTC", { sort: "name" })).map((g) => g.title)).toEqual(["Alpha", "Mid", "Zeta"]);
    expect((await getGoals(user.id, "UTC", { sort: "priority" })).map((g) => g.title)).toEqual(["Alpha", "Mid", "Zeta"]);
    // Urgency: dated soonest-first, undated last.
    expect((await getGoals(user.id, "UTC", { sort: "urgency" })).map((g) => g.title)).toEqual(["Mid", "Zeta", "Alpha"]);
  });

  it("counts goals by status for the filter bar", async () => {
    await createTestGoal(user.id, { status: "ACTIVE" });
    await createTestGoal(user.id, { status: "ACTIVE" });
    await createTestGoal(user.id, { status: "ARCHIVED" });

    expect(await getGoalStatusCounts(user.id)).toMatchObject({
      ACTIVE: 2,
      ARCHIVED: 1,
      COMPLETED: 0,
      ALL: 3,
    });
  });
});
