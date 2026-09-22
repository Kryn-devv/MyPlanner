"use client";

import { AnimatePresence } from "framer-motion";
import { Repeat, SearchX } from "lucide-react";
import type { HabitSummaryView } from "@/lib/habits/queries";
import { EmptyState } from "@/components/ui/States";
import { HabitCard } from "./HabitCard";
import { NewHabitButton } from "./NewHabitButton";

/**
 * The habit grid.
 *
 * Two distinct empty states, for the same reason the goal list has two: "you
 * have no habits" is an invitation, while "nothing matches these filters" is a
 * dead end that needs a different way out.
 */
export function HabitList({
  habits,
  today,
  isFiltered,
}: {
  habits: readonly HabitSummaryView[];
  today: string;
  isFiltered: boolean;
}) {
  if (habits.length === 0) {
    return isFiltered ? (
      <EmptyState
        icon={<SearchX />}
        title="No habits match these filters"
        description="Try a different status, or clear the search."
      />
    ) : (
      <EmptyState
        icon={<Repeat />}
        title="No habits yet."
        description="A habit answers “what do I want to consistently do?”. Start with one small thing you could keep up for a month."
        action={<NewHabitButton label="Create habit" />}
      />
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      <AnimatePresence initial={false} mode="popLayout">
        {habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} today={today} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
