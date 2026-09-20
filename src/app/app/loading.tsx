import { LoadingPanel, LoadingState, Skeleton } from "@/components/ui/States";

/**
 * Dashboard skeleton.
 *
 * Mirrors the real layout's grid so that content arriving does not reflow the
 * page — a skeleton that does not match its page is worse than none.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-44" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LoadingPanel label="Loading your progress" />
        <LoadingPanel />
        <LoadingPanel />
        <LoadingPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="panel p-3">
          <LoadingState label="Loading today's tasks" rows={4} />
        </div>
        <div className="space-y-4">
          <LoadingPanel />
          <LoadingPanel />
        </div>
      </div>
    </div>
  );
}
