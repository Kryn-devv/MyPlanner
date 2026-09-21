import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/auth/guard";
import { ActiveSessionConflictError } from "@/lib/focus/errors";
import {
  getActiveFocusSession,
  getFocusSecondsByTask,
  getTaskFocusHistory,
  getTrackedFocusSeconds,
} from "@/lib/focus/queries";
import {
  cancelFocusSession,
  completeFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  switchFocusSession,
} from "@/lib/focus/service";
import {
  createTestFocusSession,
  createTestGoal,
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestUser,
  db,
  getFocusSession,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Cross-user isolation.
 *
 * A focus session is addressed by an id that travels through the browser, so
 * every mutation here is a chance to control somebody else's timer. Each case
 * gives two users an equivalent setup and asserts that neither can touch the
 * other's — and that a foreign id is indistinguishable from one that does not
 * exist, so ids stay un-enumerable.
 */
const T0 = new Date("2026-09-21T10:00:00.000Z");
const after = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let owner: TestUser;
let intruder: TestUser;
let ownerTaskId: string;
let intruderTaskId: string;
let ownerSessionId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await createTestUser();
  intruder = await createTestUser();

  ownerTaskId = (await createTestTask(owner.id, { title: "Owner task" })).id;
  intruderTaskId = (await createTestTask(intruder.id, { title: "Intruder task" })).id;

  ownerSessionId = (await startFocusSession(owner.id, { taskId: ownerTaskId }, T0)).id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("a foreign session cannot be controlled", () => {
  it("cannot be paused", async () => {
    await expect(pauseFocusSession(intruder.id, ownerSessionId, after(60))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await getFocusSession(ownerSessionId)).status).toBe("RUNNING");
  });

  it("cannot be resumed", async () => {
    await pauseFocusSession(owner.id, ownerSessionId, after(60));

    await expect(resumeFocusSession(intruder.id, ownerSessionId, after(70))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await getFocusSession(ownerSessionId)).status).toBe("PAUSED");
  });

  it("cannot be completed", async () => {
    await expect(
      completeFocusSession(intruder.id, ownerSessionId, after(600)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const row = await getFocusSession(ownerSessionId);
    expect(row.status).toBe("RUNNING");
    expect(row.endedAt).toBeNull();
  });

  it("cannot be cancelled", async () => {
    await expect(cancelFocusSession(intruder.id, ownerSessionId, after(60))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await getFocusSession(ownerSessionId)).status).toBe("RUNNING");
  });

  it("cannot be switched away from", async () => {
    await expect(
      switchFocusSession(intruder.id, ownerSessionId, { taskId: intruderTaskId }, after(60)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await getFocusSession(ownerSessionId)).status).toBe("RUNNING");
  });

  it("is refused identically to a session that never existed", async () => {
    const foreign = await pauseFocusSession(intruder.id, ownerSessionId, after(60)).catch((e) => e);
    const fictional = await pauseFocusSession(
      intruder.id,
      "clfictional0000000000000",
      after(60),
    ).catch((e) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(fictional).toBeInstanceOf(NotFoundError);
    // Identical message: the response must not reveal that the id is real.
    expect((foreign as Error).message).toBe((fictional as Error).message);
  });
});

describe("a foreign task cannot be focused", () => {
  it("refuses to start a session on it", async () => {
    await expect(
      startFocusSession(intruder.id, { taskId: ownerTaskId }, after(60)),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await db.focusSession.count({ where: { userId: intruder.id } })).toBe(0);
  });

  it("is refused identically to a task that never existed", async () => {
    const foreign = await startFocusSession(intruder.id, { taskId: ownerTaskId }, T0).catch(
      (e) => e,
    );
    const fictional = await startFocusSession(
      intruder.id,
      { taskId: "clfictional0000000000000" },
      T0,
    ).catch((e) => e);

    expect((foreign as Error).message).toBe((fictional as Error).message);
  });

  it("cannot be reached by switching onto it", async () => {
    const own = await startFocusSession(intruder.id, { taskId: intruderTaskId }, T0);

    await expect(
      switchFocusSession(intruder.id, own.id, { taskId: ownerTaskId }, after(60)),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The intruder's own session survived the rolled-back transaction.
    expect((await getFocusSession(own.id)).status).toBe("RUNNING");
  });
});

describe("a foreign session cannot be read", () => {
  it("does not appear as the intruder's active session", async () => {
    expect(await getActiveFocusSession(intruder.id)).toBeNull();
    expect((await getActiveFocusSession(owner.id))?.id).toBe(ownerSessionId);
  });

  it("does not appear in the intruder's history of a foreign task", async () => {
    await completeFocusSession(owner.id, ownerSessionId, after(1800));

    const history = await getTaskFocusHistory(intruder.id, ownerTaskId);

    expect(history.totalSeconds).toBe(0);
    expect(history.sessionCount).toBe(0);
    expect(history.recent).toEqual([]);
  });

  it("does not appear in the intruder's per-task aggregate", async () => {
    await completeFocusSession(owner.id, ownerSessionId, after(1800));

    const totals = await getFocusSecondsByTask(intruder.id, [ownerTaskId, intruderTaskId]);
    expect(totals.get(ownerTaskId)).toBeUndefined();
  });

  it("does not appear in the intruder's tracked-focus window", async () => {
    await completeFocusSession(owner.id, ownerSessionId, after(1800));

    const window = [new Date("2026-09-21T00:00:00.000Z"), new Date("2026-09-22T00:00:00.000Z")] as const;

    expect(await getTrackedFocusSeconds(owner.id, window[0], window[1])).toBe(1800);
    expect(await getTrackedFocusSeconds(intruder.id, window[0], window[1])).toBe(0);
  });
});

describe("hierarchy is not leaked through a session", () => {
  it("never serialises a foreign project, milestone or goal", async () => {
    const goal = await createTestGoal(owner.id, { title: "Owner goal" });
    const project = await createTestProject(owner.id, { name: "Owner project", goalId: goal.id });
    const milestone = await createTestMilestone(project.id, { title: "Owner milestone" });
    const task = await createTestTask(owner.id, {
      title: "Owner detail",
      projectId: project.id,
      milestoneId: milestone.id,
    });

    await cancelFocusSession(owner.id, ownerSessionId, after(10));
    await startFocusSession(owner.id, { taskId: task.id }, after(20));
    // The intruder has their own live session, so the query definitely runs.
    await startFocusSession(intruder.id, { taskId: intruderTaskId }, after(20));

    const payload = JSON.stringify(await getActiveFocusSession(intruder.id));

    for (const secret of [goal.id, project.id, milestone.id, task.id, "Owner"]) {
      expect(payload).not.toContain(secret);
    }
  });
});

describe("each user keeps their own live session", () => {
  it("lets both focus at once without interfering", async () => {
    const theirs = await startFocusSession(intruder.id, { taskId: intruderTaskId }, after(5));

    expect((await getActiveFocusSession(owner.id))?.id).toBe(ownerSessionId);
    expect((await getActiveFocusSession(intruder.id))?.id).toBe(theirs.id);

    // One user's conflict is not the other's.
    await expect(
      startFocusSession(owner.id, { taskId: ownerTaskId }, after(10)),
    ).rejects.toBeInstanceOf(ActiveSessionConflictError);
    expect((await getFocusSession(theirs.id)).status).toBe("RUNNING");
  });

  it("keeps histories separate for identically named tasks", async () => {
    await completeFocusSession(owner.id, ownerSessionId, after(1800));
    const theirs = await startFocusSession(intruder.id, { taskId: intruderTaskId }, after(5));
    await completeFocusSession(intruder.id, theirs.id, after(605));

    expect((await getTaskFocusHistory(owner.id, ownerTaskId)).totalSeconds).toBe(1800);
    expect((await getTaskFocusHistory(intruder.id, intruderTaskId)).totalSeconds).toBe(600);
    expect((await getTaskFocusHistory(owner.id, intruderTaskId)).totalSeconds).toBe(0);
    expect((await getTaskFocusHistory(intruder.id, ownerTaskId)).totalSeconds).toBe(0);
  });
});

describe("an unknown user id reads as an empty account", () => {
  it("returns nothing rather than erroring or leaking", async () => {
    await createTestFocusSession(owner.id, {
      taskId: ownerTaskId,
      status: "COMPLETED",
      accumulatedSeconds: 3600,
    });

    expect(await getActiveFocusSession("clnobody00000000000000")).toBeNull();
    expect((await getTaskFocusHistory("clnobody00000000000000", ownerTaskId)).totalSeconds).toBe(0);
    expect(
      await getTrackedFocusSeconds(
        "clnobody00000000000000",
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("account deletion", () => {
  it("removes that account's sessions and nobody else's", async () => {
    const theirs = await startFocusSession(intruder.id, { taskId: intruderTaskId }, after(5));

    await db.user.delete({ where: { id: intruder.id } });

    expect(await db.focusSession.findUnique({ where: { id: theirs.id } })).toBeNull();
    expect((await getFocusSession(ownerSessionId)).status).toBe("RUNNING");
  });
});
