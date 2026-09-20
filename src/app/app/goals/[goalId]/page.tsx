import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getGoalDetail } from "@/lib/goals/queries";
import { GoalHeader } from "@/components/goals/GoalHeader";
import { GoalProjectSection } from "@/components/goals/GoalProjectSection";
import { GoalStats } from "@/components/goals/GoalStats";

/**
 * A single goal: what it is for, how far along it is, and the projects doing
 * the work.
 *
 * One query assembles the goal, its projects and the pooled task counts — the
 * panels share almost all of their data, and several sequential fetches is
 * what makes a page like this feel slow.
 *
 * A goal that is not the caller's resolves to `null` and becomes a 404,
 * indistinguishable from one that never existed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ goalId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { goalId } = await params;
  const detail = await getGoalDetail(user.id, goalId, user.timezone);

  return { title: detail?.goal.title ?? "Goal" };
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>;
}) {
  const user = await requireUser();
  const { goalId } = await params;

  const detail = await getGoalDetail(user.id, goalId, user.timezone);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <GoalHeader goal={detail.goal} today={detail.today} />

      <GoalStats detail={detail} />

      <GoalProjectSection
        goalId={detail.goal.id}
        projects={detail.projects}
        today={detail.today}
      />
    </div>
  );
}
