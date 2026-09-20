"use client";

import { AnimatePresence } from "framer-motion";
import { SearchX, Target } from "lucide-react";
import type { GoalSummaryView } from "@/lib/goals/queries";
import { EmptyState } from "@/components/ui/States";
import { GoalCard } from "./GoalCard";
import { NewGoalButton } from "./NewGoalButton";

/**
 * The goal grid.
 *
 * Two distinct empty states: "you have no goals" is an invitation, while
 * "nothing matches these filters" is a dead end needing a different escape.
 * Collapsing them into one message would make the first run read like a failed
 * search.
 */
export function GoalList({
  goals,
  isFiltered,
}: {
  goals: readonly GoalSummaryView[];
  isFiltered: boolean;
}) {
  if (goals.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={<SearchX />}
        title="No goals match these filters"
        description="Try a different status, or clear the search."
      />
    ) : (
      <EmptyState
        icon={<Target />}
        title="No goals yet."
        description="A goal is what your projects are for. Name one, then connect the work that gets you there."
        action={<NewGoalButton label="Create goal" />}
      />
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      <AnimatePresence initial={false} mode="popLayout">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
