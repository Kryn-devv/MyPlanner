import { Skeleton } from "@/components/ui/States";

/**
 * Mirrors the page's real shape — header, summary panel, two task groups — so
 * the content does not jump when it lands.
 */
export default function TodayLoading() {
  return (
    <div className="max-w-4xl space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading your day…</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>

      <div className="panel space-y-3 p-5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-56" />
      </div>

      {[0, 1].map((group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        </div>
      ))}
    </div>
  );
}
