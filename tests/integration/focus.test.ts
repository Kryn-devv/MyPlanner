import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MIN_TRACKED_SECONDS } from "@/config/focus";
import { NotFoundError } from "@/lib/auth/guard";
import { ActiveSessionConflictError, InvalidTransitionError } from "@/lib/focus/errors";
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
  listFocusSessions,
  resetDatabase,
  type TestUser,
} from "./helpers";

/**
 * Focus sessions against a real PostgreSQL database.
 *
 * The guarantees this feature makes — one live session per user, a duration
 * the browser cannot influence, transitions that resolve correctly under
 * concurrency — are enforced by a partial unique index and compare-and-swap
 * updates. A mocked client would verify none of them.
 */
const T0 = new Date("2026-09-21T10:00:00.000Z");
const after = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let user: TestUser;
let taskId: string;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
  const task = await createTestTask(user.id, { title: "Focus me", estimatedMinutes: 60 });
  taskId = task.id;
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("starting", () => {
  it("creates a running session with the clock started server-side", async () => {
    const session = await startFocusSession(user.id, { taskId, targetMinutes: 25 }, T0);

    expect(session.status).toBe("RUNNING");
    expect(session.accumulatedSeconds).toBe(0);
    expect(session.segmentStartedAt?.toISOString()).toBe(T0.toISOString());
    expect(session.targetMinutes).toBe(25);
    expect(session.endedAt).toBeNull();
  });

  it("allows a session with no target at all", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    expect(session.targetMinutes).toBeNull();
  });

  it("drops a target that is not a plausible sitting", async () => {
    for (const bad of [0, -25, 0.4, Number.NaN]) {
      await db.focusSession.deleteMany({ where: { userId: user.id } });
      const session = await startFocusSession(user.id, { taskId, targetMinutes: bad }, T0);
      expect(session.targetMinutes).toBeNull();
    }
  });

  it("clamps an absurd target rather than storing it", async () => {
    const session = await startFocusSession(user.id, { taskId, targetMinutes: 99_999 }, T0);
    expect(session.targetMinutes).toBe(8 * 60);
  });

  it("refuses a task that does not exist", async () => {
    await expect(
      startFocusSession(user.id, { taskId: "clnope00000000000000000" }, T0),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a second session while one is live, naming the first", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);
    const other = await createTestTask(user.id, { title: "Other" });

    const error = await startFocusSession(user.id, { taskId: other.id }, after(5)).catch((e) => e);

    expect(error).toBeInstanceOf(ActiveSessionConflictError);
    expect((error as ActiveSessionConflictError).activeSessionId).toBe(first.id);
    expect((error as ActiveSessionConflictError).activeTaskTitle).toBe("Focus me");
    // The first session is untouched — nothing was silently cancelled.
    expect((await getFocusSession(first.id)).status).toBe("RUNNING");
  });

  it("refuses a second session while the first is merely paused", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, first.id, after(60));

    await expect(startFocusSession(user.id, { taskId }, after(65))).rejects.toBeInstanceOf(
      ActiveSessionConflictError,
    );
  });

  it("allows a new session once the previous one has finished", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, first.id, after(600));

    const second = await startFocusSession(user.id, { taskId }, after(700));
    expect(second.status).toBe("RUNNING");
    expect(second.id).not.toBe(first.id);
  });

  it("allows a new session after the previous one was cancelled", async () => {
    const first = await startFocusSession(user.id, { taskId }, T0);
    await cancelFocusSession(user.id, first.id, after(60));

    const second = await startFocusSession(user.id, { taskId }, after(70));
    expect(second.status).toBe("RUNNING");
  });
});

describe("pausing and resuming", () => {
  it("banks the running segment and stops the clock", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    const paused = await pauseFocusSession(user.id, session.id, after(125));

    expect(paused.status).toBe("PAUSED");
    expect(paused.accumulatedSeconds).toBe(125);
    expect(paused.segmentStartedAt).toBeNull();
  });

  it("does not accrue time while paused, however long", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(100));

    const resumed = await resumeFocusSession(user.id, session.id, after(100_000));
    expect(resumed.accumulatedSeconds).toBe(100);
    expect(resumed.segmentStartedAt?.toISOString()).toBe(after(100_000).toISOString());
  });

  it("adds each running segment, across several pauses", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(60));
    await resumeFocusSession(user.id, session.id, after(200));
    await pauseFocusSession(user.id, session.id, after(290));
    await resumeFocusSession(user.id, session.id, after(300));

    const outcome = await completeFocusSession(user.id, session.id, after(330));

    // 60 + 90 + 30 = 180, and the 140 + 10 seconds spent paused count for
    // nothing.
    expect(outcome.trackedSeconds).toBe(180);
  });

  it("refuses to pause a session that is not running", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(10));

    const error = await pauseFocusSession(user.id, session.id, after(20)).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).reason).toBe("wrong-state");
  });

  it("refuses to resume a session that is already running", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await expect(resumeFocusSession(user.id, session.id, after(10))).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("refuses to resume a finished session", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(60));

    const error = await resumeFocusSession(user.id, session.id, after(70)).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).reason).toBe("already-finished");
  });
});

describe("completing", () => {
  it("banks the final duration from server timestamps", async () => {
    const session = await startFocusSession(user.id, { taskId, targetMinutes: 25 }, T0);
    const outcome = await completeFocusSession(user.id, session.id, after(1870));

    expect(outcome.trackedSeconds).toBe(1870);
    expect(outcome.discarded).toBe(false);

    const row = await getFocusSession(session.id);
    expect(row.status).toBe("COMPLETED");
    expect(row.accumulatedSeconds).toBe(1870);
    expect(row.segmentStartedAt).toBeNull();
    expect(row.endedAt?.toISOString()).toBe(after(1870).toISOString());
    // Working past the target does not cap the figure.
    expect(row.targetMinutes).toBe(25);
  });

  it("completes a paused session without resuming it first", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(300));

    const outcome = await completeFocusSession(user.id, session.id, after(9000));
    expect(outcome.trackedSeconds).toBe(300);
  });

  it("records a mis-click as cancelled rather than as focus", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    const outcome = await completeFocusSession(user.id, session.id, after(3));

    expect(outcome.discarded).toBe(true);
    expect(outcome.trackedSeconds).toBe(0);

    const row = await getFocusSession(session.id);
    // The row survives — it happened — it simply does not count.
    expect(row.status).toBe("CANCELLED");
    expect((await getTaskFocusHistory(user.id, taskId)).totalSeconds).toBe(0);
  });

  it("keeps a session that just reaches the threshold", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    const outcome = await completeFocusSession(user.id, session.id, after(MIN_TRACKED_SECONDS));

    expect(outcome.discarded).toBe(false);
    expect((await getFocusSession(session.id)).status).toBe("COMPLETED");
  });

  it("refuses to complete a session twice", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(600));

    const error = await completeFocusSession(user.id, session.id, after(700)).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).reason).toBe("already-finished");
    // The banked figure is not touched by the refused attempt.
    expect((await getFocusSession(session.id)).accumulatedSeconds).toBe(600);
  });

  it("leaves the task alone — focused time is not completion", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(3600));

    const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.completed).toBe(false);
    expect(task.completedAt).toBeNull();
    // Nor does it touch the estimate it was measured against.
    expect(task.estimatedMinutes).toBe(60);
  });

  it("awards no XP and touches no streak", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(3600));

    const ledger = await db.xpTransaction.count({ where: { userId: user.id } });
    const stats = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });

    expect(ledger).toBe(0);
    expect(stats.totalXp).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.lastCompletedDate).toBeNull();
  });
});

describe("cancelling", () => {
  it("keeps the row and banks what happened, but counts nothing", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    const cancelled = await cancelFocusSession(user.id, session.id, after(900));

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.accumulatedSeconds).toBe(900);
    expect(cancelled.endedAt).not.toBeNull();

    expect((await getTaskFocusHistory(user.id, taskId)).totalSeconds).toBe(0);
    expect((await listFocusSessions(user.id))).toHaveLength(1);
  });

  it("cancels a paused session", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(60));

    const cancelled = await cancelFocusSession(user.id, session.id, after(600));
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.accumulatedSeconds).toBe(60);
  });

  it("refuses to cancel twice", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await cancelFocusSession(user.id, session.id, after(60));

    await expect(cancelFocusSession(user.id, session.id, after(70))).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("awards no XP", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await cancelFocusSession(user.id, session.id, after(3600));
    expect(await db.xpTransaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("switching task", () => {
  it("cancels the old session and starts the new one atomically", async () => {
    const other = await createTestTask(user.id, { title: "Other work" });
    const first = await startFocusSession(user.id, { taskId }, T0);

    const second = await switchFocusSession(
      user.id,
      first.id,
      { taskId: other.id, targetMinutes: 45 },
      after(300),
    );

    expect((await getFocusSession(first.id)).status).toBe("CANCELLED");
    expect((await getFocusSession(first.id)).accumulatedSeconds).toBe(300);
    expect(second.status).toBe("RUNNING");
    expect(second.taskId).toBe(other.id);
    expect(second.targetMinutes).toBe(45);

    // Exactly one live session, still.
    const active = await getActiveFocusSession(user.id);
    expect(active?.id).toBe(second.id);
  });

  it("leaves everything alone when the new task is not the caller's", async () => {
    const stranger = await createTestUser();
    const theirTask = await createTestTask(stranger.id, { title: "Theirs" });
    const first = await startFocusSession(user.id, { taskId }, T0);

    await expect(
      switchFocusSession(user.id, first.id, { taskId: theirTask.id }, after(60)),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The transaction rolled back: the original session is still running.
    expect((await getFocusSession(first.id)).status).toBe("RUNNING");
    expect(await listFocusSessions(user.id)).toHaveLength(1);
  });

  it("refuses to switch away from a finished session", async () => {
    const other = await createTestTask(user.id, { title: "Other" });
    const first = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, first.id, after(600));

    await expect(
      switchFocusSession(user.id, first.id, { taskId: other.id }, after(700)),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe("the active session query", () => {
  it("returns nothing when there is none", async () => {
    expect(await getActiveFocusSession(user.id)).toBeNull();
  });

  it("carries the task's hierarchy without a query per level", async () => {
    const goal = await createTestGoal(user.id, { title: "Get into MIT" });
    const project = await createTestProject(user.id, {
      name: "SAT prep",
      color: "cyan",
      goalId: goal.id,
    });
    const milestone = await createTestMilestone(project.id, { title: "Maths" });
    const task = await createTestTask(user.id, {
      title: "Chapter 4",
      projectId: project.id,
      milestoneId: milestone.id,
      estimatedMinutes: 60,
    });
    const session = await startFocusSession(user.id, { taskId: task.id, targetMinutes: 25 }, T0);

    const active = await getActiveFocusSession(user.id);

    expect(active?.id).toBe(session.id);
    expect(active?.status).toBe("RUNNING");
    expect(active?.targetMinutes).toBe(25);
    expect(active?.segmentStartedAt).toBe(T0.toISOString());
    expect(active?.task).toMatchObject({ id: task.id, title: "Chapter 4", estimatedMinutes: 60 });
    expect(active?.task?.project).toMatchObject({ id: project.id, name: "SAT prep" });
    expect(active?.task?.milestone).toMatchObject({ title: "Maths" });
    expect(active?.task?.goal).toMatchObject({ id: goal.id, title: "Get into MIT" });
  });

  it("resolves elapsed seconds with the server's clock, for the first render", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);

    // The browser recomputes every second, but its *first* render has to match
    // the HTML the server sent or React reports a hydration mismatch.
    const active = await getActiveFocusSession(user.id, after(125));

    expect(active?.id).toBe(session.id);
    expect(active?.elapsedSeconds).toBe(125);
    expect(active?.accumulatedSeconds).toBe(0);
  });

  it("reports a paused session's elapsed seconds as what was banked", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(60));

    // However long the page is left open, a paused figure does not move.
    expect((await getActiveFocusSession(user.id, after(99_999)))?.elapsedSeconds).toBe(60);
  });

  it("finds a paused session too — paused is still live", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await pauseFocusSession(user.id, session.id, after(60));

    const active = await getActiveFocusSession(user.id);
    expect(active?.status).toBe("PAUSED");
    expect(active?.accumulatedSeconds).toBe(60);
    expect(active?.segmentStartedAt).toBeNull();
  });

  it("stops returning a session once it finishes", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await completeFocusSession(user.id, session.id, after(600));
    expect(await getActiveFocusSession(user.id)).toBeNull();
  });

  it("survives its task being deleted", async () => {
    const session = await startFocusSession(user.id, { taskId }, T0);
    await db.task.delete({ where: { id: taskId } });

    const active = await getActiveFocusSession(user.id);

    // The session is still the user's live one; it just no longer says what
    // it is for.
    expect(active?.id).toBe(session.id);
    expect(active?.task).toBeNull();
  });
});

describe("task focus history", () => {
  it("totals completed sessions only", async () => {
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 1860 });
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 1500 });
    await createTestFocusSession(user.id, { taskId, status: "CANCELLED", accumulatedSeconds: 900 });
    await createTestFocusSession(user.id, {
      taskId,
      status: "PAUSED",
      accumulatedSeconds: 600,
      endedAt: null,
    });

    const history = await getTaskFocusHistory(user.id, taskId);

    expect(history.totalSeconds).toBe(3360);
    expect(history.sessionCount).toBe(2);
    expect(history.recent).toHaveLength(2);
  });

  it("is empty, not broken, for a task with no sessions", async () => {
    const history = await getTaskFocusHistory(user.id, taskId);
    expect(history).toEqual({
      totalSeconds: 0,
      sessionCount: 0,
      recent: [],
      truncated: false,
    });
  });

  it("lists the most recent first and caps the list", async () => {
    for (let i = 0; i < 8; i += 1) {
      await createTestFocusSession(user.id, {
        taskId,
        status: "COMPLETED",
        accumulatedSeconds: 60 * (i + 1),
        endedAt: new Date(T0.getTime() + i * 86_400_000),
      });
    }

    const history = await getTaskFocusHistory(user.id, taskId);

    expect(history.sessionCount).toBe(8);
    expect(history.recent).toHaveLength(5);
    expect(history.truncated).toBe(true);
    // Newest first: the last one written has the largest duration.
    expect(history.recent[0]?.seconds).toBe(480);
    expect(history.recent[4]?.seconds).toBe(240);
  });

  it("gives the same list on every render", async () => {
    for (let i = 0; i < 7; i += 1) {
      await createTestFocusSession(user.id, {
        taskId,
        status: "COMPLETED",
        accumulatedSeconds: 600,
        endedAt: T0,
      });
    }

    const first = (await getTaskFocusHistory(user.id, taskId)).recent.map((entry) => entry.id);
    const second = (await getTaskFocusHistory(user.id, taskId)).recent.map((entry) => entry.id);
    expect(second).toEqual(first);
  });

  it("does not count another task's sessions", async () => {
    const other = await createTestTask(user.id, { title: "Other" });
    await createTestFocusSession(user.id, {
      taskId: other.id,
      status: "COMPLETED",
      accumulatedSeconds: 9999,
    });

    expect((await getTaskFocusHistory(user.id, taskId)).totalSeconds).toBe(0);
  });
});

describe("aggregates", () => {
  it("sums completed focus per task in one grouped query", async () => {
    const other = await createTestTask(user.id, { title: "Other" });
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 600 });
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 300 });
    await createTestFocusSession(user.id, {
      taskId: other.id,
      status: "COMPLETED",
      accumulatedSeconds: 1200,
    });
    await createTestFocusSession(user.id, { taskId, status: "CANCELLED", accumulatedSeconds: 900 });

    const totals = await getFocusSecondsByTask(user.id, [taskId, other.id]);

    expect(totals.get(taskId)).toBe(900);
    expect(totals.get(other.id)).toBe(1200);
  });

  it("returns an empty map for an empty request, without querying", async () => {
    expect(await getFocusSecondsByTask(user.id, [])).toEqual(new Map());
  });

  it("sums tracked focus inside a window", async () => {
    await createTestFocusSession(user.id, {
      taskId,
      status: "COMPLETED",
      accumulatedSeconds: 1800,
      endedAt: new Date("2026-09-21T09:00:00.000Z"),
    });
    await createTestFocusSession(user.id, {
      taskId,
      status: "COMPLETED",
      accumulatedSeconds: 2700,
      endedAt: new Date("2026-09-21T14:00:00.000Z"),
    });
    await createTestFocusSession(user.id, {
      taskId,
      status: "COMPLETED",
      accumulatedSeconds: 600,
      endedAt: new Date("2026-09-22T09:00:00.000Z"),
    });

    const seconds = await getTrackedFocusSeconds(
      user.id,
      new Date("2026-09-21T00:00:00.000Z"),
      new Date("2026-09-22T00:00:00.000Z"),
    );

    expect(seconds).toBe(4500);
  });

  it("excludes cancelled sessions from a window", async () => {
    await createTestFocusSession(user.id, {
      taskId,
      status: "CANCELLED",
      accumulatedSeconds: 3600,
      endedAt: new Date("2026-09-21T12:00:00.000Z"),
    });

    expect(
      await getTrackedFocusSeconds(
        user.id,
        new Date("2026-09-21T00:00:00.000Z"),
        new Date("2026-09-22T00:00:00.000Z"),
      ),
    ).toBe(0);
  });

  it("still counts a session whose task was deleted", async () => {
    await createTestFocusSession(user.id, {
      taskId,
      status: "COMPLETED",
      accumulatedSeconds: 1800,
      endedAt: new Date("2026-09-21T12:00:00.000Z"),
    });
    await db.task.delete({ where: { id: taskId } });

    // The time was still spent. It is simply no longer attributable to a task.
    expect(
      await getTrackedFocusSeconds(
        user.id,
        new Date("2026-09-21T00:00:00.000Z"),
        new Date("2026-09-22T00:00:00.000Z"),
      ),
    ).toBe(1800);
  });
});

describe("deleted tasks", () => {
  it("detaches sessions instead of destroying them", async () => {
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 1800 });
    await db.task.delete({ where: { id: taskId } });

    const sessions = await listFocusSessions(user.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.taskId).toBeNull();
    expect(sessions[0]?.accumulatedSeconds).toBe(1800);
  });

  it("does not let a detached session leak into another task's history", async () => {
    const other = await createTestTask(user.id, { title: "Other" });
    await createTestFocusSession(user.id, { taskId, status: "COMPLETED", accumulatedSeconds: 1800 });
    await db.task.delete({ where: { id: taskId } });

    expect((await getTaskFocusHistory(user.id, other.id)).totalSeconds).toBe(0);
  });
});
