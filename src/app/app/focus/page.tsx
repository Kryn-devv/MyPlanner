import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { getLocalToday, localDateToDbDate } from "@/lib/datetime";
import { getActiveFocusSession, getTaskFocusHistory } from "@/lib/focus/queries";
import { prisma } from "@/lib/prisma";
import { FocusSessionView } from "@/components/focus/FocusSessionView";
import { FocusStarter, type FocusCandidate } from "@/components/focus/FocusStarter";
import { TaskFocusHistory } from "@/components/focus/TaskFocusHistory";

export const metadata: Metadata = { title: "Focus" };

/** How many of today's open tasks the empty state offers to start on. */
const CANDIDATE_LIMIT = 5;

/**
 * Focus mode.
 *
 * The server decides which session this page shows — there is no session id in
 * the URL, so there is nothing to tamper with and no way to address somebody
 * else's timer. At most one session can be active per user, so "the active
 * session" is unambiguous.
 *
 * The page renders the session's timestamps; the browser derives the clock
 * from them. Nothing about the elapsed figure is stored client-side, which is
 * why a refresh, a navigation or a closed browser all come back to the right
 * number.
 */
export default async function FocusPage() {
  const user = await requireUser();
  const session = await getActiveFocusSession(user.id);

  if (session) {
    // Resolved here rather than in the browser: a "started 6 hours ago" notice
    // computed from the client's clock would differ between machines.
    const startedAgoHours = (Date.now() - Date.parse(session.startedAt)) / 3_600_000;

    // This app has no task detail page — tasks live in lists and in the edit
    // dialog — so a task's focus record belongs here, where it is also most
    // useful: what you have already put into the thing in front of you.
    const history = session.task
      ? await getTaskFocusHistory(user.id, session.task.id)
      : null;

    return (
      <>
        <FocusSessionView session={session} startedAgo={startedAgoHours} />

        {history && (history.sessionCount > 0 || session.task?.estimatedMinutes !== null) && (
          <div className="mx-auto max-w-xl border-t border-line pt-5">
            <TaskFocusHistory
              history={history}
              estimatedMinutes={session.task?.estimatedMinutes ?? null}
              timezone={user.timezone}
              today={getLocalToday(user.timezone)}
            />
          </div>
        )}
      </>
    );
  }

  // Bounded: today's open work, which is what someone opening this page was
  // most likely about to start. Choosing *what* to work on is Today's job.
  const today = getLocalToday(user.timezone);
  const rows = await prisma.task.findMany({
    where: { userId: user.id, completed: false, dueDate: { lte: localDateToDbDate(today) } },
    select: { id: true, title: true, project: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: CANDIDATE_LIMIT,
  });

  const candidates: FocusCandidate[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectName: row.project?.name ?? null,
  }));

  return <FocusStarter candidates={candidates} />;
}
