import { Skeleton } from "@/components/ui/States";

/** Mirrors the detail layout so the page does not jump when data arrives. */
export default function HabitDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-[22px] w-[22px] shrink-0 rounded-full" />
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-56" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-[var(--radius-panel)]" />
        ))}
      </div>

      <Skeleton className="h-52 rounded-[var(--radius-panel)]" />
    </div>
  );
}
