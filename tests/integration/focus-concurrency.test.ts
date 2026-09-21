import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ActiveSessionConflictError, InvalidTransitionError } from "@/lib/focus/errors";
import { getActiveFocusSession, getTaskFocusHistory } from "@/lib/focus/queries";
import {
  cancelFocusSession,
  completeFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  switchFocusSession,
} from "@/lib/focus/service";
import {
  createTestTask,
  createTestUser,
  db,
  getFocusSession,
  listFocusSessions,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Races.
 *
 * An impatient user double-tapping, a retried request, two tabs open at once —
 * these all issue the same operation twice at nearly the same moment. Every
 * case here fires the real operations concurrently and asserts that the
 * database, not the application's own bookkeeping, decides who wins.
 */
const T0 = new Date("2026-09-21T10:00:00.000Z");
const after = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let user: TestUser;
let taskId: string;
let otherTaskId: string;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
  taskId = (await createTestTask(user.id, { title: "A" })).id;
  otherTaskId = (await createTestTask(user.id, { title: "B" })).id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

/** Runs the promises concurrently and splits them into wins and refusals. */
async function race(promises: readonly Promise<unknown>[]) {
  const results = await Promise.allSettled(promises);
  return {
    fulfilled: results.filter((r) => r.status === "fulfilled").map((r) => r.value),
    rejected: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason),
  };
}

describe("two starts at once", () => {
  it("creates exactly one live session", async () => {
    const { fulfilled, rejected } = await race([
      startFocusSession(user.id, { taskId }, T0),
      startFocusSession(user.id, { taskId: otherTaskId }, T0),
    ]);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(ActiveSessionConflictError);

    // The partial unique index is what decided this, not a prior check.
    const sessions = await listFocusSessions(user.id);
    expect(sessions.filter((s) => s.status === "RUNNING" || s.status === "PAUSED")).toHaveLength(1);
  });

  it("holds when the same task is started ten times at once", async () => {
    const attempts = Array.from({ length: 10 }, () =>
      startFocusSession(user.id, { taskId }, T0).catch((error: unknown) => error),
    );
    const results = await Promise.all(attempts);

    const created = results.filter((r) => !(r instanceof Error));
    const refused = results.filter((r) => r instanceof ActiveSessionConflictError);

    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(9);
    expect(await listFocusSessions(user.id)).toHaveLength(1);
  });

  it("lets two different users start at the same moment", async () => {
    const second = await createTestUser();
    const theirTask = await createTestTask(second.id, { title: "Theirs" });

    const { fulfilled } = await race([
      startFocusSession(user.id, { taskId }, T0),
      startFocusSession(second.id, { taskId: theirTask.id }, T0),
    ]);

    // The index is per user, so these do not contend at all.
    expect(fulfilled).toHaveLength(2);
  });
});

describe("pause racing complete", () => {
  it("lands in exactly one valid state", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    const { fulfilled, rejected } = await race([
      pauseFocusSession(user.id, session.id, after(60)),
      completeFocusSession(user.id, session.id, after(60)),
    ]);

    expect(fulfilled.length + rejected.length).toBe(2);
    const row = await getFocusSession(session.id);

    // Whichever won, the row is coherent: a session is never both.
    expect(["PAUSED", "COMPLETED"]).toContain(row.status);
    if (row.status === "COMPLETED") {
      expect(row.endedAt).not.toBeNull();
      expect(row.segmentStartedAt).toBeNull();
    } else {
      expect(row.endedAt).toBeNull();
      expect(row.segmentStartedAt).toBeNull();
    }
    expect(row.accumulatedSeconds).toBe(60);
  });
});

describe("resume racing cancel", () => {
  it("lands in exactly one valid state", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(30));

    await race([
      resumeFocusSession(user.id, session.id, after(60)),
      cancelFocusSession(user.id, session.id, after(60)),
    ]);

    const row = await getFocusSession(session.id);
    expect(["RUNNING", "CANCELLED"]).toContain(row.status);

    if (row.status === "CANCELLED") {
      expect(row.segmentStartedAt).toBeNull();
      expect(row.endedAt).not.toBeNull();
      // A cancelled session never counts, whatever it had banked.
      expect((await getTaskFocusHistory(user.id, taskId)).totalSeconds).toBe(0);
    } else {
      expect(row.segmentStartedAt).not.toBeNull();
      expect(row.endedAt).toBeNull();
    }
  });
});

describe("two completions at once", () => {
  it("transitions once and banks one figure", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    const { fulfilled, rejected } = await race([
      completeFocusSession(user.id, session.id, after(600)),
      completeFocusSession(user.id, session.id, after(900)),
    ]);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(InvalidTransitionError);

    const row = await getFocusSession(session.id);
    expect(row.status).toBe("COMPLETED");
    // Exactly one of the two durations, never their sum.
    expect([600, 900]).toContain(row.accumulatedSeconds);

    const history = await getTaskFocusHistory(user.id, taskId);
    expect(history.sessionCount).toBe(1);
    expect(history.totalSeconds).toBe(row.accumulatedSeconds);
  });

  it("does not double-count in the total when five complete at once", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        completeFocusSession(user.id, session.id, after(300)).catch((error: unknown) => error),
      ),
    );

    expect(results.filter((r) => !(r instanceof Error))).toHaveLength(1);
    expect((await getTaskFocusHistory(user.id, taskId)).totalSeconds).toBe(300);
  });
});

describe("two cancellations at once", () => {
  it("cancels once and refuses the rest", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    const { fulfilled, rejected } = await race([
      cancelFocusSession(user.id, session.id, after(120)),
      cancelFocusSession(user.id, session.id, after(120)),
    ]);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(InvalidTransitionError);
    expect((await getFocusSession(session.id)).status).toBe("CANCELLED");
  });
});

describe("complete racing cancel", () => {
  it("never produces a session that is both", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    await race([
      completeFocusSession(user.id, session.id, after(600)),
      cancelFocusSession(user.id, session.id, after(600)),
    ]);

    const row = await getFocusSession(session.id);
    expect(["COMPLETED", "CANCELLED"]).toContain(row.status);

    const history = await getTaskFocusHistory(user.id, taskId);
    // Counted exactly when it completed, never when it was cancelled.
    expect(history.totalSeconds).toBe(row.status === "COMPLETED" ? 600 : 0);
  });
});

describe("switching under contention", () => {
  it("never leaves two live sessions when switch races a start", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);

    await race([
      switchFocusSession(user.id, first.id, { taskId: otherTaskId }, after(300)),
      startFocusSession(user.id, { taskId: otherTaskId }, after(300)),
    ]);

    const live = (await listFocusSessions(user.id)).filter(
      (s) => s.status === "RUNNING" || s.status === "PAUSED",
    );
    expect(live).toHaveLength(1);
  });

  it("never leaves two live sessions when two switches race", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);

    await race([
      switchFocusSession(user.id, first.id, { taskId: otherTaskId }, after(300)),
      switchFocusSession(user.id, first.id, { taskId: otherTaskId }, after(300)),
    ]);

    const live = (await listFocusSessions(user.id)).filter(
      (s) => s.status === "RUNNING" || s.status === "PAUSED",
    );
    expect(live).toHaveLength(1);

    const active = await getActiveFocusSession(user.id);
    expect(active).not.toBeNull();
  });
});

describe("what a loser of a race is told", () => {
  it("does not claim a still-live session has finished", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    // Pause wins; the second request finds a PAUSED — still live — session.
    const { rejected } = await race([
      pauseFocusSession(user.id, session.id, after(60)),
      pauseFocusSession(user.id, session.id, after(60)),
    ]);

    const error = rejected[0] as InvalidTransitionError;
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(error.reason).toBe("wrong-state");
    expect(error.message).not.toMatch(/already finished/i);
  });

  it("does say so when the session really has finished", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(600));

    const error = await pauseFocusSession(user.id, session.id, after(700)).catch((e) => e);
    expect((error as InvalidTransitionError).reason).toBe("already-finished");
  });
});

describe("pause racing pause", () => {
  it("banks one figure, not two", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    const { fulfilled, rejected } = await race([
      pauseFocusSession(user.id, session.id, after(100)),
      pauseFocusSession(user.id, session.id, after(150)),
    ]);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const row = await getFocusSession(session.id);
    expect(row.status).toBe("PAUSED");
    // One of the two elapsed readings — never 250.
    expect([100, 150]).toContain(row.accumulatedSeconds);
  });
});
