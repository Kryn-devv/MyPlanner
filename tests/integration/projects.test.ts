import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { MAX_MILESTONES_PER_PROJECT } from "@/config/projects";
import {
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  reorderMilestones,
  setMilestoneStatus,
  setProjectStatus,
  updateMilestone,
  updateProject,
} from "@/lib/projects/service";
import { getProjectDetail, getProjects, getProjectStatusCounts } from "@/lib/projects/queries";
import {
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Project and milestone lifecycle against a real database.
 *
 * The delete behaviour in particular is enforced by foreign keys, not by
 * application code, so it can only be verified here.
 */

let user: TestUser;

const projectInput = (overrides: Partial<Parameters<typeof createProject>[1]> = {}) => ({
  name: "Build IRIS AI Assistant",
  description: null,
  color: "violet",
  priority: "MEDIUM" as const,
  status: "ACTIVE" as const,
  startDate: null,
  dueDate: null,
  ...overrides,
});

const milestoneInput = (overrides: Partial<Parameters<typeof createMilestone>[2]> = {}) => ({
  title: "Hardware",
  description: null,
  dueDate: null,
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

describe("project CRUD", () => {
  it("creates a project with every field persisted", async () => {
    const { id } = await createProject(
      user.id,
      projectInput({
        description: "Voice assistant for the exhibition.",
        color: "cyan",
        priority: "URGENT",
        startDate: "2026-09-01",
        dueDate: "2026-12-05",
      }),
    );

    const stored = await db.project.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      userId: user.id,
      name: "Build IRIS AI Assistant",
      description: "Voice assistant for the exhibition.",
      color: "cyan",
      priority: "URGENT",
      status: "ACTIVE",
      completedAt: null,
      archivedAt: null,
    });
    expect(stored.startDate?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(stored.dueDate?.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("updates a project it owns", async () => {
    const project = await createTestProject(user.id);
    await updateProject(user.id, project.id, projectInput({ name: "Renamed", priority: "HIGH" }));

    const stored = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.name).toBe("Renamed");
    expect(stored.priority).toBe("HIGH");
  });

  it("reports an unknown project as not found", async () => {
    await expect(updateProject(user.id, "nope", projectInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(setProjectStatus(user.id, "nope", "COMPLETED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteProject(user.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("project status transitions", () => {
  it("completing stamps completedAt", async () => {
    const project = await createTestProject(user.id);
    const outcome = await setProjectStatus(user.id, project.id, "COMPLETED");

    expect(outcome.changed).toBe(true);
    const stored = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.status).toBe("COMPLETED");
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect(stored.archivedAt).toBeNull();
  });

  it("reopening clears both timestamps", async () => {
    const project = await createTestProject(user.id);
    await setProjectStatus(user.id, project.id, "COMPLETED");
    await setProjectStatus(user.id, project.id, "ACTIVE");

    const stored = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.completedAt).toBeNull();
    expect(stored.archivedAt).toBeNull();
  });

  it("archiving preserves when it was completed", async () => {
    const project = await createTestProject(user.id);
    await setProjectStatus(user.id, project.id, "COMPLETED");
    const completedAt = (await db.project.findUniqueOrThrow({ where: { id: project.id } })).completedAt;

    await setProjectStatus(user.id, project.id, "ARCHIVED");

    const stored = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.status).toBe("ARCHIVED");
    expect(stored.archivedAt).toBeInstanceOf(Date);
    expect(stored.completedAt?.toISOString()).toBe(completedAt?.toISOString());
  });

  it("restoring an archived project makes it active again", async () => {
    const project = await createTestProject(user.id, { status: "ARCHIVED" });
    await setProjectStatus(user.id, project.id, "ACTIVE");

    const stored = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.archivedAt).toBeNull();
  });

  it("is a no-op when already in the target state", async () => {
    const project = await createTestProject(user.id, { status: "ACTIVE" });
    const outcome = await setProjectStatus(user.id, project.id, "ACTIVE");
    expect(outcome.changed).toBe(false);
  });

  it("never awards XP for completing a project", async () => {
    // Organising work is not achievement. Task completion is the only source.
    const project = await createTestProject(user.id);
    await createTestTask(user.id, { projectId: project.id, completed: true });

    const before = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    await setProjectStatus(user.id, project.id, "COMPLETED");
    const after = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });

    expect(after.totalXp).toBe(before.totalXp);
    expect(await db.xpTransaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("project deletion", () => {
  it("deletes its milestones but keeps its tasks", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);
    const task = await createTestTask(user.id, {
      projectId: project.id,
      milestoneId: milestone.id,
    });

    const outcome = await deleteProject(user.id, project.id);
    expect(outcome).toEqual({ detachedTasks: 1, deletedMilestones: 1 });

    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await db.milestone.findUnique({ where: { id: milestone.id } })).toBeNull();

    // The task survives, detached from both.
    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.projectId).toBeNull();
    expect(stored.milestoneId).toBeNull();
    expect(stored.title).toBe(task.title);
  });

  it("preserves completed tasks and their XP history", async () => {
    const project = await createTestProject(user.id);
    const task = await createTestTask(user.id, { projectId: project.id, completed: true });
    await db.xpTransaction.create({
      data: { userId: user.id, taskId: task.id, amount: 40, kind: "AWARD", cycle: 1 },
    });

    await deleteProject(user.id, project.id);

    expect(await db.task.findUnique({ where: { id: task.id } })).not.toBeNull();
    expect(await db.xpTransaction.count({ where: { taskId: task.id } })).toBe(1);
  });

  it("leaves tasks in other projects alone", async () => {
    const doomed = await createTestProject(user.id, { name: "Doomed" });
    const keeper = await createTestProject(user.id, { name: "Keeper" });
    const kept = await createTestTask(user.id, { projectId: keeper.id });

    await deleteProject(user.id, doomed.id);

    expect((await db.task.findUniqueOrThrow({ where: { id: kept.id } })).projectId).toBe(keeper.id);
  });
});

describe("milestone CRUD", () => {
  it("creates milestones with increasing positions", async () => {
    const project = await createTestProject(user.id);

    const first = await createMilestone(user.id, project.id, milestoneInput({ title: "Hardware" }));
    const second = await createMilestone(user.id, project.id, milestoneInput({ title: "Voice System" }));
    const third = await createMilestone(user.id, project.id, milestoneInput({ title: "AI Brain" }));

    const stored = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { id: true, title: true, position: true },
    });
    expect(stored.map((m) => m.title)).toEqual(["Hardware", "Voice System", "AI Brain"]);
    expect(stored.map((m) => m.position)).toEqual([0, 1, 2]);
    expect([first.id, second.id, third.id]).toHaveLength(3);
  });

  it("still appends to the end after a milestone is deleted", async () => {
    // Positions are an ordering device, not identifiers: the contract is that
    // a new milestone lands last and the sequence stays strictly increasing.
    // Which integers it uses is deliberately not specified.
    const project = await createTestProject(user.id);
    await createMilestone(user.id, project.id, milestoneInput({ title: "A" }));
    const b = await createMilestone(user.id, project.id, milestoneInput({ title: "B" }));
    await createMilestone(user.id, project.id, milestoneInput({ title: "C" }));
    await deleteMilestone(user.id, b.id);
    await createMilestone(user.id, project.id, milestoneInput({ title: "D" }));

    const stored = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { title: true, position: true },
    });

    expect(stored.map((m) => m.title)).toEqual(["A", "C", "D"]);
    const positions = stored.map((m) => m.position);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("caps how many milestones a project can hold", async () => {
    const project = await createTestProject(user.id);
    await db.milestone.createMany({
      data: Array.from({ length: MAX_MILESTONES_PER_PROJECT }, (_, i) => ({
        projectId: project.id,
        title: `M${i}`,
        position: i,
      })),
    });

    await expect(createMilestone(user.id, project.id, milestoneInput())).rejects.toThrow();
  });

  it("updates a milestone", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);

    await updateMilestone(user.id, milestone.id, milestoneInput({ title: "Renamed", dueDate: "2026-11-15" }));

    const stored = await db.milestone.findUniqueOrThrow({ where: { id: milestone.id } });
    expect(stored.title).toBe("Renamed");
    expect(stored.dueDate?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("completes and reopens a milestone", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);

    expect((await setMilestoneStatus(user.id, milestone.id, "COMPLETED")).changed).toBe(true);
    let stored = await db.milestone.findUniqueOrThrow({ where: { id: milestone.id } });
    expect(stored.status).toBe("COMPLETED");
    expect(stored.completedAt).toBeInstanceOf(Date);

    expect((await setMilestoneStatus(user.id, milestone.id, "PENDING")).changed).toBe(true);
    stored = await db.milestone.findUniqueOrThrow({ where: { id: milestone.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.completedAt).toBeNull();
  });

  it("settles concurrent completion attempts to one change", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => setMilestoneStatus(user.id, milestone.id, "COMPLETED")),
    );
    const changed = results.filter((r) => r.status === "fulfilled" && r.value.changed);

    expect(changed).toHaveLength(1);
    expect((await db.milestone.findUniqueOrThrow({ where: { id: milestone.id } })).status).toBe("COMPLETED");
  });

  it("never awards XP for completing a milestone", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);

    await setMilestoneStatus(user.id, milestone.id, "COMPLETED");

    expect(await db.xpTransaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await db.userStats.findUniqueOrThrow({ where: { userId: user.id } })).totalXp).toBe(0);
  });

  it("deletes a milestone but keeps its tasks in the project", async () => {
    const project = await createTestProject(user.id);
    const milestone = await createTestMilestone(project.id);
    const task = await createTestTask(user.id, { projectId: project.id, milestoneId: milestone.id });

    const outcome = await deleteMilestone(user.id, milestone.id);
    expect(outcome.detachedTasks).toBe(1);

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.milestoneId).toBeNull();
    // Crucially, still in the project.
    expect(stored.projectId).toBe(project.id);
  });
});

describe("milestone reordering", () => {
  it("rewrites positions to the supplied order", async () => {
    const project = await createTestProject(user.id);
    const a = await createTestMilestone(project.id, { title: "A", position: 0 });
    const b = await createTestMilestone(project.id, { title: "B", position: 1 });
    const c = await createTestMilestone(project.id, { title: "C", position: 2 });

    await reorderMilestones(user.id, project.id, [c.id, a.id, b.id]);

    const stored = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { title: true },
    });
    expect(stored.map((m) => m.title)).toEqual(["C", "A", "B"]);
  });

  it("rejects a partial order rather than applying half of it", async () => {
    const project = await createTestProject(user.id);
    const a = await createTestMilestone(project.id, { title: "A", position: 0 });
    await createTestMilestone(project.id, { title: "B", position: 1 });

    await expect(reorderMilestones(user.id, project.id, [a.id])).rejects.toBeInstanceOf(NotFoundError);

    const stored = await db.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { position: "asc" },
      select: { title: true },
    });
    expect(stored.map((m) => m.title)).toEqual(["A", "B"]);
  });

  it("rejects an order containing a foreign milestone", async () => {
    const project = await createTestProject(user.id);
    const other = await createTestProject(user.id, { name: "Other" });
    const mine = await createTestMilestone(project.id, { title: "Mine" });
    const theirs = await createTestMilestone(other.id, { title: "Theirs" });

    await expect(
      reorderMilestones(user.id, project.id, [mine.id, theirs.id]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("progress queries", () => {
  it("derives project progress from task state", async () => {
    const project = await createTestProject(user.id);
    await createTestTask(user.id, { projectId: project.id, completed: true });
    await createTestTask(user.id, { projectId: project.id, completed: true });
    await createTestTask(user.id, { projectId: project.id, completed: false });

    const detail = await getProjectDetail(user.id, project.id, "UTC");
    expect(detail?.project.progress).toMatchObject({ total: 3, completed: 2, percent: 67 });
  });

  it("derives milestone progress independently of the project's", async () => {
    const project = await createTestProject(user.id);
    const hardware = await createTestMilestone(project.id, { title: "Hardware", position: 0 });
    const voice = await createTestMilestone(project.id, { title: "Voice", position: 1 });

    await createTestTask(user.id, { projectId: project.id, milestoneId: hardware.id, completed: true });
    await createTestTask(user.id, { projectId: project.id, milestoneId: hardware.id, completed: false });
    await createTestTask(user.id, { projectId: project.id, milestoneId: voice.id, completed: true });
    // Also a project task under no milestone at all.
    await createTestTask(user.id, { projectId: project.id, completed: false });

    const detail = await getProjectDetail(user.id, project.id, "UTC");
    const byTitle = new Map(detail?.milestones.map((m) => [m.title, m]));

    expect(byTitle.get("Hardware")?.progress).toMatchObject({ total: 2, completed: 1, percent: 50 });
    expect(byTitle.get("Voice")?.progress).toMatchObject({ total: 1, completed: 1, isComplete: true });
    expect(detail?.project.progress).toMatchObject({ total: 4, completed: 2 });
    expect(detail?.unassignedTasks).toHaveLength(1);
  });

  it("reports an empty milestone as empty rather than 0%", async () => {
    const project = await createTestProject(user.id);
    await createTestMilestone(project.id, { title: "Empty" });

    const detail = await getProjectDetail(user.id, project.id, "UTC");
    expect(detail?.milestones[0]?.progress).toMatchObject({ isEmpty: true, isComplete: false, percent: 0 });
  });

  it("counts only this user's tasks towards progress", async () => {
    const project = await createTestProject(user.id);
    const stranger = await createTestUser();

    await createTestTask(user.id, { projectId: project.id, completed: true });
    // A task row pointing at the project but owned by someone else cannot
    // normally be created through the app; forced here to prove the count is
    // scoped by userId and not by projectId alone.
    await db.task.create({
      data: { userId: stranger.id, title: "Foreign", projectId: project.id, completed: false },
    });

    const detail = await getProjectDetail(user.id, project.id, "UTC");
    expect(detail?.project.progress).toMatchObject({ total: 1, completed: 1 });
  });

  it("returns null for a project that is not the caller's", async () => {
    const stranger = await createTestUser();
    const theirs = await createTestProject(stranger.id);

    expect(await getProjectDetail(user.id, theirs.id, "UTC")).toBeNull();
  });
});

describe("project listing", () => {
  it("filters by status", async () => {
    await createTestProject(user.id, { name: "Live", status: "ACTIVE" });
    await createTestProject(user.id, { name: "Done", status: "COMPLETED" });
    await createTestProject(user.id, { name: "Filed", status: "ARCHIVED" });

    const active = await getProjects(user.id, "UTC", { status: "ACTIVE" });
    const archived = await getProjects(user.id, "UTC", { status: "ARCHIVED" });
    const all = await getProjects(user.id, "UTC", { status: "ALL" });

    expect(active.map((p) => p.name)).toEqual(["Live"]);
    expect(archived.map((p) => p.name)).toEqual(["Filed"]);
    expect(all).toHaveLength(3);
  });

  it("hides archived projects from the default view", async () => {
    await createTestProject(user.id, { name: "Filed", status: "ARCHIVED" });
    expect(await getProjects(user.id, "UTC", {})).toHaveLength(0);
  });

  it("finds overdue projects using the user's calendar day", async () => {
    await createTestProject(user.id, { name: "Late", dueDate: new Date("2026-09-18T00:00:00Z") });
    await createTestProject(user.id, { name: "Soon", dueDate: new Date("2026-09-25T00:00:00Z") });
    await createTestProject(user.id, {
      name: "Late but done",
      status: "COMPLETED",
      dueDate: new Date("2026-09-01T00:00:00Z"),
    });

    const overdue = await getProjects(
      user.id,
      "UTC",
      { status: "OVERDUE" },
      new Date("2026-09-20T12:00:00Z"),
    );
    expect(overdue.map((p) => p.name)).toEqual(["Late"]);
  });

  it("searches name and description", async () => {
    await createTestProject(user.id, { name: "Portfolio rebuild" });
    await createTestProject(user.id, { name: "SAT Preparation" });

    const byName = await getProjects(user.id, "UTC", { search: "portfolio" });
    expect(byName.map((p) => p.name)).toEqual(["Portfolio rebuild"]);
  });

  it("sorts by name, priority and urgency", async () => {
    await createTestProject(user.id, { name: "Zeta", priority: "LOW", dueDate: new Date("2026-12-01T00:00:00Z") });
    await createTestProject(user.id, { name: "Alpha", priority: "URGENT", dueDate: null });
    await createTestProject(user.id, { name: "Mid", priority: "HIGH", dueDate: new Date("2026-10-01T00:00:00Z") });

    const byName = await getProjects(user.id, "UTC", { sort: "name" });
    expect(byName.map((p) => p.name)).toEqual(["Alpha", "Mid", "Zeta"]);

    const byPriority = await getProjects(user.id, "UTC", { sort: "priority" });
    expect(byPriority.map((p) => p.name)).toEqual(["Alpha", "Mid", "Zeta"]);

    // Urgency: dated soonest-first, undated last.
    const byUrgency = await getProjects(user.id, "UTC", { sort: "urgency" });
    expect(byUrgency.map((p) => p.name)).toEqual(["Mid", "Zeta", "Alpha"]);
  });

  it("reports milestone counts alongside progress", async () => {
    const project = await createTestProject(user.id);
    await createTestMilestone(project.id, { title: "A", status: "COMPLETED" });
    await createTestMilestone(project.id, { title: "B" });

    const [summary] = await getProjects(user.id, "UTC", {});
    expect(summary?.milestoneCount).toBe(2);
    expect(summary?.completedMilestoneCount).toBe(1);
  });

  it("counts projects by status for the filter bar", async () => {
    await createTestProject(user.id, { status: "ACTIVE" });
    await createTestProject(user.id, { status: "ACTIVE" });
    await createTestProject(user.id, { status: "ARCHIVED" });

    expect(await getProjectStatusCounts(user.id)).toMatchObject({
      ACTIVE: 2,
      ARCHIVED: 1,
      COMPLETED: 0,
      ALL: 3,
    });
  });
});
