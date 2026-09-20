import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import {
  createMilestone,
  deleteMilestone,
  deleteProject,
  reorderMilestones,
  setMilestoneStatus,
  setProjectStatus,
  updateMilestone,
  updateProject,
} from "@/lib/projects/service";
import {
  getActiveProjectsForDashboard,
  getProjectDetail,
  getProjectOptions,
  getProjects,
  getProjectStatusCounts,
} from "@/lib/projects/queries";
import { getTasks } from "@/lib/tasks/queries";
import { createTask, InvalidAssignmentError, setTaskAssignment, updateTask } from "@/lib/tasks/service";
import {
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  getAssignment,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * The Phase 2 cross-user security matrix.
 *
 * Two fully populated accounts. Every project, milestone and assignment
 * operation is attempted across the boundary in both directions, and each is
 * checked to fail *and to leave the database untouched* — a mutation that is
 * rejected halfway through is still a breach.
 */

let alice: TestUser;
let mallory: TestUser;

interface Fixture {
  projectId: string;
  milestoneId: string;
  taskId: string;
}

let a: Fixture;
let b: Fixture;

const projectInput = {
  name: "Renamed by attacker",
  description: null,
  color: "rose",
  priority: "URGENT" as const,
  status: "ARCHIVED" as const,
  startDate: null,
  dueDate: null,
};

const milestoneInput = { title: "Injected", description: null, dueDate: null };

async function buildFixture(user: TestUser, label: string): Promise<Fixture> {
  const project = await createTestProject(user.id, { name: `${label} project` });
  const milestone = await createTestMilestone(project.id, { title: `${label} milestone` });
  const task = await createTestTask(user.id, {
    title: `${label} task`,
    projectId: project.id,
    milestoneId: milestone.id,
  });
  return { projectId: project.id, milestoneId: milestone.id, taskId: task.id };
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
    projects: await db.project.findMany({ orderBy: { id: "asc" } }),
    milestones: await db.milestone.findMany({ orderBy: { id: "asc" } }),
    tasks: await db.task.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("reading another user's projects", () => {
  it("does not list them", async () => {
    const mine = await getProjects(mallory.id, "UTC", { status: "ALL" });
    expect(mine.map((p) => p.name)).toEqual(["Mallory project"]);
  });

  it("returns null for their project detail", async () => {
    expect(await getProjectDetail(mallory.id, a.projectId, "UTC")).toBeNull();
    // Sanity: the project really does exist.
    expect(await getProjectDetail(alice.id, a.projectId, "UTC")).not.toBeNull();
  });

  it("does not offer them in the task form's project picker", async () => {
    const options = await getProjectOptions(mallory.id);
    expect(options.map((p) => p.id)).not.toContain(a.projectId);
    expect(options.flatMap((p) => p.milestones.map((m) => m.id))).not.toContain(a.milestoneId);
  });

  it("does not count them in the status counts", async () => {
    expect(await getProjectStatusCounts(mallory.id)).toMatchObject({ ALL: 1 });
  });

  it("does not surface them on the dashboard", async () => {
    const dash = await getActiveProjectsForDashboard(mallory.id, "UTC", 10);
    expect(dash.map((p) => p.id)).toEqual([b.projectId]);
  });

  it("does not leak their tasks through a project filter", async () => {
    const tasks = await getTasks(mallory.id, { status: "all", projectId: a.projectId });
    expect(tasks).toHaveLength(0);
  });

  it("does not leak their tasks through a milestone filter", async () => {
    const tasks = await getTasks(mallory.id, { status: "all", milestoneId: a.milestoneId });
    expect(tasks).toHaveLength(0);
  });
});

describe("writing to another user's project", () => {
  it("refuses to update it, changing nothing", async () => {
    const before = await snapshot();
    await expect(updateProject(mallory.id, a.projectId, projectInput)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to change its status", async () => {
    const before = await snapshot();
    await expect(setProjectStatus(mallory.id, a.projectId, "ARCHIVED")).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to delete it", async () => {
    const before = await snapshot();
    await expect(deleteProject(mallory.id, a.projectId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to add a milestone to it", async () => {
    const before = await snapshot();
    await expect(createMilestone(mallory.id, a.projectId, milestoneInput)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to reorder its milestones", async () => {
    const before = await snapshot();
    await expect(
      reorderMilestones(mallory.id, a.projectId, [a.milestoneId]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });
});

describe("writing to another user's milestone", () => {
  it("refuses to update it", async () => {
    const before = await snapshot();
    await expect(updateMilestone(mallory.id, a.milestoneId, milestoneInput)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to complete it", async () => {
    const before = await snapshot();
    await expect(setMilestoneStatus(mallory.id, a.milestoneId, "COMPLETED")).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to delete it", async () => {
    const before = await snapshot();
    await expect(deleteMilestone(mallory.id, a.milestoneId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });
});

describe("cross-user task assignment", () => {
  it("refuses to file my task into their project", async () => {
    const before = await snapshot();
    await expect(
      setTaskAssignment(mallory.id, b.taskId, a.projectId, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to file their task into my project", async () => {
    const before = await snapshot();
    // The task is not Mallory's, so there is nothing to move in the first place.
    await expect(
      setTaskAssignment(mallory.id, a.taskId, b.projectId, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to file my task under their milestone", async () => {
    const before = await snapshot();
    await expect(
      setTaskAssignment(mallory.id, b.taskId, b.projectId, a.milestoneId),
    ).rejects.toBeInstanceOf(InvalidAssignmentError);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a task created directly into their project", async () => {
    const before = await snapshot();
    await expect(
      createTask(mallory.id, {
        title: "Injected",
        description: null,
        priority: "MEDIUM",
        categoryId: null,
        dueDate: null,
        dueTime: null,
        estimatedMinutes: null,
        xpReward: 20,
        projectId: a.projectId,
        milestoneId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // No half-created task left behind.
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to move their task via an update", async () => {
    const before = await snapshot();
    await expect(
      updateTask(mallory.id, a.taskId, {
        title: "Hijacked",
        description: null,
        priority: "LOW",
        categoryId: null,
        dueDate: null,
        dueTime: null,
        estimatedMinutes: null,
        xpReward: 10,
        projectId: b.projectId,
        milestoneId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });
});

describe("mismatched project and milestone within one account", () => {
  it("refuses a milestone from a different project of my own", async () => {
    // Not a cross-user attack — just an inconsistent hierarchy, which must be
    // impossible regardless of who owns the pieces.
    const otherProject = await createTestProject(alice.id, { name: "Alice second" });
    const otherMilestone = await createTestMilestone(otherProject.id, { title: "Elsewhere" });

    await expect(
      setTaskAssignment(alice.id, a.taskId, a.projectId, otherMilestone.id),
    ).rejects.toBeInstanceOf(InvalidAssignmentError);

    // The original assignment is intact.
    expect(await getAssignment(a.taskId)).toEqual({
      projectId: a.projectId,
      milestoneId: a.milestoneId,
    });
  });

  it("refuses a milestone with no project", async () => {
    await expect(
      setTaskAssignment(alice.id, a.taskId, null, a.milestoneId),
    ).rejects.toBeInstanceOf(InvalidAssignmentError);
  });

  it("refuses a milestone id that does not exist", async () => {
    await expect(
      setTaskAssignment(alice.id, a.taskId, a.projectId, "no-such-milestone"),
    ).rejects.toBeInstanceOf(InvalidAssignmentError);
  });

  it("refuses a project id that does not exist", async () => {
    await expect(
      setTaskAssignment(alice.id, a.taskId, "no-such-project", null),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("allows the valid combinations", async () => {
    // Project + its own milestone.
    await setTaskAssignment(alice.id, a.taskId, a.projectId, a.milestoneId);
    expect(await getAssignment(a.taskId)).toEqual({
      projectId: a.projectId,
      milestoneId: a.milestoneId,
    });

    // Project, no milestone.
    await setTaskAssignment(alice.id, a.taskId, a.projectId, null);
    expect(await getAssignment(a.taskId)).toEqual({ projectId: a.projectId, milestoneId: null });

    // Neither.
    await setTaskAssignment(alice.id, a.taskId, null, null);
    expect(await getAssignment(a.taskId)).toEqual({ projectId: null, milestoneId: null });
  });
});

describe("error responses do not distinguish foreign from missing", () => {
  it("gives the same message for another user's project and a fictional one", async () => {
    const foreign = await setProjectStatus(mallory.id, a.projectId, "ARCHIVED").catch((e: Error) => e);
    const missing = await setProjectStatus(mallory.id, "no-such-project", "ARCHIVED").catch((e: Error) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((foreign as Error).message).toBe((missing as Error).message);
  });

  it("gives the same message for another user's milestone and a fictional one", async () => {
    const foreign = await deleteMilestone(mallory.id, a.milestoneId).catch((e: Error) => e);
    const missing = await deleteMilestone(mallory.id, "no-such-milestone").catch((e: Error) => e);

    expect((foreign as Error).message).toBe((missing as Error).message);
  });
});

describe("account deletion", () => {
  it("removes that account's projects and milestones only", async () => {
    await db.user.delete({ where: { id: alice.id } });

    expect(await db.project.findUnique({ where: { id: a.projectId } })).toBeNull();
    expect(await db.milestone.findUnique({ where: { id: a.milestoneId } })).toBeNull();

    // Mallory is untouched.
    expect(await db.project.findUnique({ where: { id: b.projectId } })).not.toBeNull();
    expect(await db.milestone.findUnique({ where: { id: b.milestoneId } })).not.toBeNull();
    expect(await getAssignment(b.taskId)).toEqual({
      projectId: b.projectId,
      milestoneId: b.milestoneId,
    });
  });
});
