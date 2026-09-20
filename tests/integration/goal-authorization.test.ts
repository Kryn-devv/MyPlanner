import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { deleteGoal, setGoalStatus, setProjectGoal, updateGoal } from "@/lib/goals/service";
import {
  getActiveGoalsForDashboard,
  getGoalDetail,
  getGoalOptions,
  getGoals,
  getGoalStatusCounts,
} from "@/lib/goals/queries";
import { getProjects } from "@/lib/projects/queries";
import { createProject, updateProject } from "@/lib/projects/service";
import {
  createTestGoal,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  getProjectGoal,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * The Phase 3 cross-user security matrix.
 *
 * Two fully populated accounts. Every goal operation and every goal/project
 * relationship operation is attempted across the boundary in both directions,
 * and each is checked to fail *and to leave the database untouched* — a
 * mutation rejected halfway through is still a breach.
 */

let alice: TestUser;
let mallory: TestUser;

interface Fixture {
  goalId: string;
  projectId: string;
  taskId: string;
  /** Owned by the same user but deliberately not connected to their goal. */
  looseProjectId: string;
}

let a: Fixture;
let b: Fixture;

const goalInput = {
  title: "Renamed by attacker",
  description: null,
  priority: "URGENT" as const,
  status: "ARCHIVED" as const,
  startDate: null,
  targetDate: null,
};

const projectInput = (goalId: string | null) => ({
  name: "Injected",
  description: null,
  color: "rose",
  priority: "URGENT" as const,
  status: "ACTIVE" as const,
  startDate: null,
  dueDate: null,
  goalId,
});

async function buildFixture(user: TestUser, label: string): Promise<Fixture> {
  const goal = await createTestGoal(user.id, { title: `${label} goal` });
  const project = await createTestProject(user.id, { name: `${label} project`, goalId: goal.id });
  const loose = await createTestProject(user.id, { name: `${label} loose project` });
  const task = await createTestTask(user.id, { title: `${label} task`, projectId: project.id });
  return { goalId: goal.id, projectId: project.id, taskId: task.id, looseProjectId: loose.id };
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createTestUser();
  mallory = await createTestUser();
  a = await buildFixture(alice, "Alice");
  b = await buildFixture(mallory, "Mallory");
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

/** Snapshot of everything an attacker might manage to change. */
async function snapshot() {
  return {
    goals: await db.goal.findMany({ orderBy: { id: "asc" } }),
    projects: await db.project.findMany({ orderBy: { id: "asc" } }),
    tasks: await db.task.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("reading another user's goals", () => {
  it("does not list them", async () => {
    const mine = await getGoals(mallory.id, "UTC", { status: "ALL" });
    expect(mine.map((g) => g.title)).toEqual(["Mallory goal"]);
  });

  it("returns null for their goal detail", async () => {
    expect(await getGoalDetail(mallory.id, a.goalId, "UTC")).toBeNull();
    // Sanity: the goal really does exist.
    expect(await getGoalDetail(alice.id, a.goalId, "UTC")).not.toBeNull();
  });

  it("does not offer them in the project form's goal picker", async () => {
    const options = await getGoalOptions(mallory.id);
    expect(options.map((g) => g.id)).not.toContain(a.goalId);
  });

  it("does not count them in the status counts", async () => {
    expect(await getGoalStatusCounts(mallory.id)).toMatchObject({ ALL: 1 });
  });

  it("does not surface them on the dashboard", async () => {
    const dash = await getActiveGoalsForDashboard(mallory.id, "UTC", 10);
    expect(dash.map((g) => g.id)).toEqual([b.goalId]);
  });

  it("does not leak their projects through a goal filter", async () => {
    const projects = await getProjects(mallory.id, "UTC", { status: "ALL", goalId: a.goalId });
    expect(projects).toHaveLength(0);
  });

  it("does not count their tasks towards my goal's progress", async () => {
    // Forced directly, because the app offers no way to create this state —
    // proving the aggregate is scoped by userId and not by goal alone.
    await db.project.update({ where: { id: b.looseProjectId }, data: { goalId: b.goalId } });
    await db.task.create({
      data: { userId: alice.id, title: "Alice stray", projectId: b.looseProjectId },
    });

    const detail = await getGoalDetail(mallory.id, b.goalId, "UTC");
    expect(detail?.goal.progress.total).toBe(1);
  });
});

describe("writing to another user's goal", () => {
  it("refuses to update it, changing nothing", async () => {
    const before = await snapshot();
    await expect(updateGoal(mallory.id, a.goalId, goalInput)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to change its status", async () => {
    const before = await snapshot();
    await expect(setGoalStatus(mallory.id, a.goalId, "ARCHIVED")).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to delete it", async () => {
    const before = await snapshot();
    await expect(deleteGoal(mallory.id, a.goalId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to create a project under it", async () => {
    const before = await snapshot();
    await expect(
      createProject(mallory.id, projectInput(a.goalId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    // No half-created project left behind.
    expect(await snapshot()).toEqual(before);
  });
});

describe("cross-user project/goal assignment", () => {
  it("refuses to file my project under their goal", async () => {
    const before = await snapshot();
    await expect(
      setProjectGoal(mallory.id, b.looseProjectId, a.goalId),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to file their project under my goal", async () => {
    const before = await snapshot();
    // The project is not Mallory's, so there is nothing to move.
    await expect(
      setProjectGoal(mallory.id, a.looseProjectId, b.goalId),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to release their project from its goal", async () => {
    const before = await snapshot();
    await expect(
      setProjectGoal(mallory.id, a.projectId, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
    expect(await getProjectGoal(a.projectId)).toBe(a.goalId);
  });

  it("refuses to move their project via an ordinary project update", async () => {
    const before = await snapshot();
    await expect(
      updateProject(mallory.id, a.projectId, projectInput(b.goalId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to attach my own project to their goal via an update", async () => {
    // Mallory owns the project; the goal is Alice's. The project-side check
    // passes, so only the goal-side check can catch this.
    const before = await snapshot();
    await expect(
      updateProject(mallory.id, b.looseProjectId, projectInput(a.goalId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
    expect(await getProjectGoal(b.looseProjectId)).toBeNull();
  });
});

describe("same-owner relationships still work", () => {
  it("connects a project that was not previously connected", async () => {
    await setProjectGoal(alice.id, a.looseProjectId, a.goalId);
    expect(await getProjectGoal(a.looseProjectId)).toBe(a.goalId);
  });

  it("moves a project between the owner's own goals", async () => {
    const second = await createTestGoal(alice.id, { title: "Alice second" });
    await setProjectGoal(alice.id, a.projectId, second.id);
    expect(await getProjectGoal(a.projectId)).toBe(second.id);
  });

  it("releases the owner's project", async () => {
    await setProjectGoal(alice.id, a.projectId, null);
    expect(await getProjectGoal(a.projectId)).toBeNull();
  });
});

describe("error responses do not distinguish foreign from missing", () => {
  it("gives the same message for another user's goal and a fictional one", async () => {
    const foreign = await setGoalStatus(mallory.id, a.goalId, "ARCHIVED").catch((e: Error) => e);
    const missing = await setGoalStatus(mallory.id, "no-such-goal", "ARCHIVED").catch((e: Error) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((foreign as Error).message).toBe((missing as Error).message);
  });

  it("gives the same message when assigning to a foreign versus a fictional goal", async () => {
    const foreign = await setProjectGoal(mallory.id, b.looseProjectId, a.goalId).catch((e: Error) => e);
    const missing = await setProjectGoal(mallory.id, b.looseProjectId, "no-such-goal").catch((e: Error) => e);

    expect((foreign as Error).message).toBe((missing as Error).message);
  });
});

describe("account deletion", () => {
  it("removes that account's goals only, and releases nothing of the other's", async () => {
    await db.user.delete({ where: { id: alice.id } });

    expect(await db.goal.findUnique({ where: { id: a.goalId } })).toBeNull();
    expect(await db.project.findUnique({ where: { id: a.projectId } })).toBeNull();

    // Mallory is untouched, goal link intact.
    expect(await db.goal.findUnique({ where: { id: b.goalId } })).not.toBeNull();
    expect(await getProjectGoal(b.projectId)).toBe(b.goalId);
  });
});
